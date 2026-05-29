/**
 * API Route: /api/multimodal/sessions
 * GET: List multimodal sessions
 * POST: Create/end a multimodal session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createMultimodalSessionManager, type MultimodalType } from '@/lib/multimodal';

const VALID_TYPES: MultimodalType[] = ['vision', 'webcam', 'screen_share', 'audio', 'multimodal'];

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const manager = createMultimodalSessionManager(auth.userId);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as MultimodalType | null;

    const sessions = await manager.listSessions(type || undefined);

    const res = NextResponse.json({
      sessions,
      total: sessions.length,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list sessions';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action, type, agentId, inputModes, outputModes, config, sessionId } = body;

    const manager = createMultimodalSessionManager(auth.userId);

    if (action === 'end' && sessionId) {
      await manager.endSession(sessionId);
      const res = NextResponse.json({ success: true, message: 'Session ended' });
      return secureResponse(res, request);
    }

    if (action === 'delete' && sessionId) {
      await manager.deleteSession(sessionId);
      const res = NextResponse.json({ success: true, message: 'Session deleted' });
      return secureResponse(res, request);
    }

    // Create new session
    if (!type || !VALID_TYPES.includes(type)) {
      const res = NextResponse.json(
        { error: `Type is required. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const session = await manager.createSession({
      type,
      agentId,
      inputModes,
      outputModes,
      config,
    });

    const res = NextResponse.json({ session }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session operation failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
