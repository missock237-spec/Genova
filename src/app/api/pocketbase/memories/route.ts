/**
 * PocketBase Agent Memories API
 *
 * GET  /api/pocketbase/memories — List agent memories
 * POST /api/pocketbase/memories — Store agent memory
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentMemories, storeAgentMemory, searchAgentMemories, checkPocketBaseHealth } from '@/lib/pocketbase-client';

export async function GET(request: NextRequest) {
  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'PocketBase service is not available' }, { status: 503 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    const agentId = request.nextUrl.searchParams.get('agentId');
    const memoryType = request.nextUrl.searchParams.get('memoryType') || undefined;
    const query = request.nextUrl.searchParams.get('q') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    if (!userId || !agentId) {
      return NextResponse.json({ error: 'userId and agentId are required' }, { status: 400 });
    }

    const memories = query
      ? await searchAgentMemories(userId, agentId, query, limit)
      : await getAgentMemories(userId, agentId, { memoryType, limit });

    return NextResponse.json({ memories, total: memories.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get memories';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'PocketBase service is not available' }, { status: 503 });
    }

    const body = await request.json();

    if (!body.userId || !body.agentId || !body.memoryType || !body.content) {
      return NextResponse.json({ error: 'userId, agentId, memoryType, and content are required' }, { status: 400 });
    }

    const memory = await storeAgentMemory({
      userId: body.userId,
      agentId: body.agentId,
      memoryType: body.memoryType,
      content: body.content,
      metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
      relevanceScore: body.relevanceScore,
      expiresAt: body.expiresAt,
    });

    return NextResponse.json(memory, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store memory';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
