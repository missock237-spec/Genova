/**
 * API Route: /api/avatars/[id]/session
 * POST: Start or end an avatar conversation session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAvatarSessionEngine } from '@/lib/avatars/avatar-session';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id: avatarId } = await params;
    const body = await request.json();
    const { action, agentId, input, config } = body;

    const sessionEngine = createAvatarSessionEngine(auth.userId);

    if (action === 'start') {
      const session = await sessionEngine.startSession({
        avatarConfigId: avatarId,
        agentId,
        config,
      });

      const res = NextResponse.json({
        session,
        message: 'Avatar session started',
      }, { status: 201 });
      return secureResponse(res, request);
    }

    if (action === 'input') {
      if (!input || !input.type || !input.content) {
        const res = NextResponse.json(
          { error: 'Input with type and content is required' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }

      const output = await sessionEngine.processInput(input);

      const res = NextResponse.json({
        output,
        message: 'Input processed',
      });
      return secureResponse(res, request);
    }

    if (action === 'end') {
      await sessionEngine.endSession();

      const res = NextResponse.json({
        success: true,
        message: 'Avatar session ended',
      });
      return secureResponse(res, request);
    }

    const res = NextResponse.json(
      { error: 'Invalid action. Must be: start, input, or end' },
      { status: 400 }
    );
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session operation failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
