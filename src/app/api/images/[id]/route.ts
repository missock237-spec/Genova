import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getImageGeneration, deleteImageGeneration } from '@/lib/image-generator';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// GET /api/images/[id] — Get a specific generated image
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const image = await getImageGeneration(id, auth.userId);

    if (!image) {
      return secureResponse(
        NextResponse.json({ error: 'Image not found' }, { status: 404 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json(image),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 }),
      request
    );
  }
}

// ============================================================
// DELETE /api/images/[id] — Delete a generated image
// ============================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const deleted = await deleteImageGeneration(id, auth.userId);

    if (!deleted) {
      return secureResponse(
        NextResponse.json({ error: 'Image not found' }, { status: 404 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json({ success: true, message: 'Image deleted' }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to delete image' }, { status: 500 }),
      request
    );
  }
}
