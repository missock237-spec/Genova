/**
 * PocketBase Agent Learnings API
 *
 * GET  /api/pocketbase/learnings — List agent learnings
 * POST /api/pocketbase/learnings — Store agent learning
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAgentLearnings, storeAgentLearning, checkPocketBaseHealth } from '@/lib/pocketbase-client';

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
    const category = request.nextUrl.searchParams.get('category') || undefined;

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

    const learnings = await getAgentLearnings(userId, agentId, category);
    return secureResponse(NextResponse.json({ learnings, total: learnings.length }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get learnings';
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

    if (!body.userId || !body.agentId || !body.category || !body.pattern || !body.response) {
      return secureResponse(
        NextResponse.json({ error: 'userId, agentId, category, pattern, and response are required' }, { status: 400 }),
        request
      );
    }

    // Enforce userId from auth — users can only create data for themselves
    body.userId = auth.userId;

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

    return secureResponse(NextResponse.json(learning, { status: 201 }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store learning';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
