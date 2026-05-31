/**
 * GET /api/connectors/keys/[id] — Get access key details.
 * PATCH /api/connectors/keys/[id] — Update access key.
 * DELETE /api/connectors/keys/[id] — Delete access key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAccessKeyManager } from '@/lib/connectors/access-key-manager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const akManager = getAccessKeyManager();
    const key = await akManager.getById(auth.userId, id);

    if (!key) {
      const res = NextResponse.json({ error: 'Access key not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const res = NextResponse.json({ success: true, data: key });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Failed to fetch access key' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const akManager = getAccessKeyManager();

    const updated = await akManager.update(auth.userId, id, {
      name: body.name,
      description: body.description,
      keyValue: body.keyValue,
      endpoint: body.endpoint,
      scopes: body.scopes,
      metadata: body.metadata,
      testEndpoint: body.testEndpoint,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : body.expiresAt === null ? null : undefined,
      isActive: body.isActive,
    });

    const res = NextResponse.json({ success: true, data: updated });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const akManager = getAccessKeyManager();
    await akManager.delete(auth.userId, id);

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
