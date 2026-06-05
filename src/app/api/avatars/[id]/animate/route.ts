/**
 * API Route: /api/avatars/[id]/animate
 * POST: Generate animation/lip-sync for an avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAvatarEngine, type AvatarExpression } from '@/lib/avatars/avatar-engine';

const VALID_EXPRESSIONS: AvatarExpression[] = [
  'neutral', 'happy', 'sad', 'angry', 'surprised',
  'thinking', 'speaking', 'listening', 'wink', 'laugh',
];

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
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { type, expression, text, duration, intensity, language, speed } = body;

    const engine = createAvatarEngine(auth.userId);
    const avatar = await engine.getAvatar(id);

    if (!avatar) {
      const res = NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    if (type === 'expression') {
      // Animate expression
      const expr = expression || 'neutral';
      if (!VALID_EXPRESSIONS.includes(expr)) {
        const res = NextResponse.json(
          { error: `Invalid expression. Must be one of: ${VALID_EXPRESSIONS.join(', ')}` },
          { status: 400 }
        );
        return secureResponse(res, request);
      }

      const result = await engine.animateExpression(id, expr, {
        duration: duration || 1000,
        intensity: intensity || 1.0,
      });

      const res = NextResponse.json({
        type: 'expression',
        expression: result.expression,
        duration: result.duration,
        frameCount: result.frames.length,
        frames: result.frames,
      });
      return secureResponse(res, request);
    }

    if (type === 'lipsync') {
      // Generate lip-sync
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const res = NextResponse.json({ error: 'Text is required for lip-sync' }, { status: 400 });
        return secureResponse(res, request);
      }

      const result = await engine.generateLipSync(id, text, {
        language: language || 'en',
        speed: speed || 1.0,
      });

      const res = NextResponse.json({
        type: 'lipsync',
        duration: result.duration,
        phonemeCount: result.phonemeCount,
        lipSyncFrames: result.lipSyncFrames,
        audioUrl: result.audioUrl,
      });
      return secureResponse(res, request);
    }

    if (type === 'image') {
      // Generate avatar image
      const expr = expression || 'neutral';
      const imageResult = await engine.generateAvatarImage(id, expr as AvatarExpression, {
        width: body.width,
        height: body.height,
      });

      const res = NextResponse.json({
        type: 'image',
        expression: expr,
        imageBase64: imageResult.imageBase64,
        thumbnailUrl: imageResult.thumbnailUrl,
      });
      return secureResponse(res, request);
    }

    const res = NextResponse.json(
      { error: 'Invalid type. Must be: expression, lipsync, or image' },
      { status: 400 }
    );
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Animation failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
