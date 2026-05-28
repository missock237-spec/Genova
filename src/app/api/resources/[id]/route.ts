import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const resource = await db.userResource.findUnique({ where: { id } });
    if (!resource) {
      const res = NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    if (resource.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'You do not have permission to update this resource' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Validate input fields on update
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100)) {
      const res = NextResponse.json(
        { error: 'Name must be a string at most 100 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (body.apiKey !== undefined && body.apiKey !== null && typeof body.apiKey === 'string' && body.apiKey.length > 5000) {
      const res = NextResponse.json(
        { error: 'API key too long (max 5000 characters)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (body.endpoint !== undefined && body.endpoint !== null && typeof body.endpoint === 'string' && body.endpoint.length > 500) {
      const res = NextResponse.json(
        { error: 'Endpoint too long (max 500 characters)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const updated = await db.userResource.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.config !== undefined && {
          config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config),
        }),
        ...(body.apiKey !== undefined && { apiKey: body.apiKey }),
        ...(body.endpoint !== undefined && { endpoint: body.endpoint }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    const res = NextResponse.json({
      id: updated.id,
      type: updated.type,
      name: updated.name,
      config: (() => { try { return JSON.parse(updated.config); } catch { return {}; } })(),
      apiKey: updated.apiKey ? '••••••••' : null,
      endpoint: updated.endpoint,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to update resource' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    const resource = await db.userResource.findUnique({ where: { id } });
    if (!resource) {
      const res = NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    if (resource.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'You do not have permission to delete this resource' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    await db.userResource.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Resource Deleted',
        details: JSON.stringify({ type: resource.type, name: resource.name }),
        category: 'resource',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to delete resource' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
