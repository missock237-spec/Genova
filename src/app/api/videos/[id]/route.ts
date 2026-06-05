/**
 * GET    /api/videos/[id] — Get a specific video generation
 * DELETE /api/videos/[id] — Delete a video generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { getVideoGeneration, deleteVideoGeneration } from '@/lib/video-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const video = await getVideoGeneration(id, auth.userId);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    return NextResponse.json(video);
  } catch {
    return NextResponse.json({ error: 'Failed to get video' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const deleted = await deleteVideoGeneration(id, auth.userId);
    if (!deleted) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
