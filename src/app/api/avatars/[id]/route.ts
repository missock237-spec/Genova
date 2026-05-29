/**
 * API Route: /api/avatars/[id]
 * GET: Get avatar by ID
 * PUT: Update avatar
 * DELETE: Delete avatar
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createAvatarEngine, type AvatarStyle } from '@/lib/avatars/avatar-engine';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

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
    const engine = createAvatarEngine(auth.userId);
    const avatar = await engine.getAvatar(id);

    if (!avatar) {
      const res = NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const res = NextResponse.json({ avatar });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get avatar';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PUT(
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
    const { name, style, voiceId, customData, isActive } = body;

    const validStyles: AvatarStyle[] = ['realistic', 'cartoon', 'anime', 'abstract'];
    if (style && !validStyles.includes(style)) {
      const res = NextResponse.json(
        { error: `Invalid style. Must be one of: ${validStyles.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const engine = createAvatarEngine(auth.userId);
    const existing = await engine.getAvatar(id);
    if (!existing) {
      const res = NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const avatar = await engine.updateAvatar(id, {
      name,
      style,
      voiceId,
      customData,
      isActive,
    });

    const res = NextResponse.json({ avatar });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update avatar';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

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
    const engine = createAvatarEngine(auth.userId);
    const existing = await engine.getAvatar(id);
    if (!existing) {
      const res = NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    await engine.deleteAvatar(id);

    const res = NextResponse.json({ success: true, message: 'Avatar deleted' });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete avatar';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
