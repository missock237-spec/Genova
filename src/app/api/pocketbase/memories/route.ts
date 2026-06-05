/**
 * PocketBase Agent Memories API
 *
 * GET  /api/pocketbase/memories — List agent memories
 * POST /api/pocketbase/memories — Store agent memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAgentMemories, storeAgentMemory, searchAgentMemories, checkPocketBaseHealth } from '@/lib/pocketbase-client';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({ error: 'PocketBase service is not available' }, { status: 503 }),
        request
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    const agentId = request.nextUrl.searchParams.get('agentId');
    const memoryType = request.nextUrl.searchParams.get('memoryType') || undefined;
    const query = request.nextUrl.searchParams.get('q') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    if (!userId || !agentId) {
      return secureResponse(
        NextResponse.json({ error: 'userId and agentId are required' }, { status: 400 }),
        request
      );
    }

    // Verify ownership: userId must match authenticated user
    if (userId && userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Access denied' }, { status: 403 }),
        request
      );
    }

    const memories = query
      ? await searchAgentMemories(userId, agentId, query, limit)
      : await getAgentMemories(userId, agentId, { memoryType, limit });

    return secureResponse(NextResponse.json({ memories, total: memories.length }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get memories';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({ error: 'PocketBase service is not available' }, { status: 503 }),
        request
      );
    }

    const body = await request.json();

    if (!body.userId || !body.agentId || !body.memoryType || !body.content) {
      return secureResponse(
        NextResponse.json({ error: 'userId, agentId, memoryType, and content are required' }, { status: 400 }),
        request
      );
    }

    // Enforce userId from auth — users can only create data for themselves
    body.userId = auth.userId;

    const memory = await storeAgentMemory({
      userId: body.userId,
      agentId: body.agentId,
      memoryType: body.memoryType,
      content: body.content,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      relevanceScore: body.relevanceScore,
      expiresAt: body.expiresAt,
    });

    return secureResponse(NextResponse.json(memory, { status: 201 }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store memory';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
