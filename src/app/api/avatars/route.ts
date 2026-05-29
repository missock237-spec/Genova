/**
 * API Route: /api/avatars
 * GET: List all avatars for the authenticated user
 * POST: Create a new avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAvatarEngine, type AvatarStyle } from '@/lib/avatars/avatar-engine';

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
    const engine = createAvatarEngine(auth.userId);
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const avatars = await engine.listAvatars(includeInactive);

    const res = NextResponse.json({
      avatars,
      total: avatars.length,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list avatars';
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
    const { name, style, model, voiceId, appearance, customData } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      const res = NextResponse.json({ error: 'Avatar name is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    const validStyles: AvatarStyle[] = ['realistic', 'cartoon', 'anime', 'abstract'];
    if (style && !validStyles.includes(style)) {
      const res = NextResponse.json(
        { error: `Invalid style. Must be one of: ${validStyles.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const engine = createAvatarEngine(auth.userId);
    const avatar = await engine.createAvatar({
      name: name.trim(),
      style: style || 'realistic',
      model,
      voiceId,
      appearance,
      customData,
    });

    const res = NextResponse.json({ avatar }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create avatar';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
