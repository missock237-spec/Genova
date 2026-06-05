import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { recall, getConversationContext, getPreferenceContext } from '@/lib/memory/contextual-recall';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'recall') {
      const { query, agentId, limit, minScore, includeCategories, excludeCategories } = body;
      if (!query) {
        return secureResponse(NextResponse.json({ error: 'Query is required' }, { status: 400 }), request);
      }
      const memories = await recall({
        query,
        userId: auth.userId,
        agentId,
        limit,
        minScore,
        includeCategories,
        excludeCategories,
      });
      return secureResponse(NextResponse.json({ memories }), request);
    }

    if (action === 'conversationContext') {
      const { message, agentId } = body;
      if (!message) {
        return secureResponse(NextResponse.json({ error: 'Message is required' }, { status: 400 }), request);
      }
      const context = await getConversationContext(auth.userId, message, agentId);
      return secureResponse(NextResponse.json({ context }), request);
    }

    if (action === 'preferenceContext') {
      const context = await getPreferenceContext(auth.userId);
      return secureResponse(NextResponse.json({ context }), request);
    }

    return secureResponse(NextResponse.json({ error: 'Invalid action. Use: recall, conversationContext, preferenceContext' }, { status: 400 }), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to recall memories' }, { status: 500 });
    return secureResponse(res, request);
  }
}
