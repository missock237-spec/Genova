/**
 * PocketBase Agent Learnings API
 *
 * GET  /api/pocketbase/learnings — List agent learnings
 * POST /api/pocketbase/learnings — Store agent learning
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgentLearnings, storeAgentLearning, checkPocketBaseHealth } from '@/lib/pocketbase-client';

export async function GET(request: NextRequest) {
  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'PocketBase service is not available' }, { status: 503 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    const agentId = request.nextUrl.searchParams.get('agentId');
    const category = request.nextUrl.searchParams.get('category') || undefined;

    if (!userId || !agentId) {
      return NextResponse.json({ error: 'userId and agentId are required' }, { status: 400 });
    }

    const learnings = await getAgentLearnings(userId, agentId, category);
    return NextResponse.json({ learnings, total: learnings.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get learnings';
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

    if (!body.userId || !body.agentId || !body.category || !body.pattern || !body.response) {
      return NextResponse.json({ error: 'userId, agentId, category, pattern, and response are required' }, { status: 400 });
    }

    const learning = await storeAgentLearning({
      userId: body.userId,
      agentId: body.agentId,
      category: body.category,
      pattern: body.pattern,
      response: body.response,
      confidence: body.confidence ?? 0.5,
      usageCount: 0,
      lastUsedAt: new Date().toISOString(),
    });

    return NextResponse.json(learning, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store learning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
