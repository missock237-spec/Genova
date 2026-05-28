import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  storeMemory,
  retrieveMemories,
  getAgentMemoryStats,
  pruneOldMemories,
} from '@/lib/agent-memory';
import type { MemoryCategory, MemorySource } from '@/lib/agent-memory';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/agents/[id]/memory
 * Retrieve agent memories with optional search query and stats.
 *
 * Query params:
 *   - query: search keyword
 *   - category: filter by category (preference, episodic, procedural, semantic, general)
 *   - limit: max results (default 20, max 100)
 *   - stats: if "true", return memory statistics instead of memories
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    // Verify agent belongs to user
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const { searchParams } = new URL(request.url);
    const statsMode = searchParams.get('stats') === 'true';

    // Stats mode: return memory statistics
    if (statsMode) {
      const stats = await getAgentMemoryStats(id);
      const res = NextResponse.json({ stats });
      return secureResponse(res, request);
    }

    // Normal retrieval mode
    const query = searchParams.get('query') || '';
    const category = searchParams.get('category') as MemoryCategory | null;
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(limitParam, 1), 100);

    if (query) {
      // Search mode: retrieve memories matching the query
      const memories = await retrieveMemories(id, auth.userId, query, {
        category: category || undefined,
        limit,
        minRelevance: 0.1,
      });
      const res = NextResponse.json({ memories, total: memories.length });
      return secureResponse(res, request);
    }

    // List mode: return recent memories, optionally filtered by category
    const where: Record<string, unknown> = {
      agentId: id,
      userId: auth.userId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (category) {
      where.category = category;
    }

    const memories = await db.agentMemory.findMany({
      where,
      orderBy: { lastAccessedAt: 'desc' },
      take: limit,
    });

    const total = await db.agentMemory.count({ where });

    const serialized = memories.map((m) => ({
      ...m,
      tags: safeParseJSON(m.tags),
    }));

    const res = NextResponse.json({ memories: serialized, total });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to retrieve memories' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

/**
 * POST /api/agents/[id]/memory
 * Store a new memory for the agent.
 *
 * Body:
 *   - content: string (required, max 5000 chars)
 *   - category: string (optional, auto-categorized if not provided)
 *   - source: string (optional, default "interaction")
 *   - context: object (optional)
 *   - tags: string[] (optional, auto-extracted if not provided)
 *   - relevance: number (optional, 0-1)
 *   - expiresInDays: number (optional, days until memory expires)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    // Verify agent belongs to user
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const body = await request.json();
    const { content, category, source, context, tags, relevance, expiresInDays } = body;

    // Validate required fields
    if (!content || typeof content !== 'string') {
      const res = NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (content.length > 5000) {
      const res = NextResponse.json(
        { error: 'Content must be at most 5000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate category if provided
    const validCategories: MemoryCategory[] = ['preference', 'episodic', 'procedural', 'semantic', 'general'];
    if (category && !validCategories.includes(category)) {
      const res = NextResponse.json(
        { error: `Invalid category. Allowed: ${validCategories.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate source if provided
    const validSources: MemorySource[] = ['interaction', 'observation', 'feedback', 'system'];
    if (source && !validSources.includes(source)) {
      const res = NextResponse.json(
        { error: `Invalid source. Allowed: ${validSources.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate relevance if provided
    if (relevance !== undefined && (typeof relevance !== 'number' || relevance < 0 || relevance > 1)) {
      const res = NextResponse.json(
        { error: 'Relevance must be a number between 0 and 1' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Calculate expiry date if specified
    let expiresAt: Date | undefined;
    if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    const memory = await storeMemory(id, auth.userId, content, {
      category: category || undefined,
      source: source || undefined,
      context: context || undefined,
      tags: tags || undefined,
      relevance: relevance || undefined,
      expiresAt,
    });

    const res = NextResponse.json({ memory }, { status: 201 });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to store memory' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

/**
 * DELETE /api/agents/[id]/memory
 * Delete a specific memory or prune old memories.
 *
 * Body:
 *   - memoryId: string (required for single deletion)
 *   - prune: boolean (optional, prune old memories)
 *   - maxMemories: number (optional, max memories to keep when pruning, default 500)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    // Verify agent belongs to user
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const body = await request.json();
    const { memoryId, prune, maxMemories } = body;

    // Prune mode: clean up old/irrelevant memories
    if (prune) {
      const max = typeof maxMemories === 'number' && maxMemories > 0
        ? maxMemories
        : 500;

      const result = await pruneOldMemories(id, max);
      const res = NextResponse.json({
        success: true,
        pruned: result.pruned,
        remaining: result.remaining,
      });
      return secureResponse(res, request);
    }

    // Single deletion mode
    if (!memoryId || typeof memoryId !== 'string') {
      const res = NextResponse.json(
        { error: 'memoryId is required for deletion' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Verify memory belongs to this agent and user
    const memory = await db.agentMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory || memory.agentId !== id || memory.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    await db.agentMemory.delete({ where: { id: memoryId } });

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParseJSON<T>(jsonString: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return [] as unknown as T;
  }
}
