import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const VALID_TYPES = ['cpu', 'api', 'mvp', 'database', 'storage'];

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const typeFilter = request.nextUrl.searchParams.get('type');

    const resources = await db.userResource.findMany({
      where: {
        userId: auth.userId,
        ...(typeFilter && VALID_TYPES.includes(typeFilter) ? { type: typeFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        name: true,
        config: true,
        endpoint: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Parse config JSON for each resource
    const parsedResources = resources.map((r) => ({
      ...r,
      config: (() => { try { return JSON.parse(r.config); } catch { return {}; } })(),
    }));

    const res = NextResponse.json(parsedResources);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { type, name, config, apiKey, endpoint } = body;

    if (!type || !name || !config) {
      const res = NextResponse.json(
        { error: 'Type, name, and config are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (name.length > 100) {
      const res = NextResponse.json(
        { error: 'Name must be at most 100 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (!VALID_TYPES.includes(type)) {
      const res = NextResponse.json(
        { error: `Invalid resource type. Allowed: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const resource = await db.userResource.create({
      data: {
        type,
        name,
        config: typeof config === 'string' ? config : JSON.stringify(config),
        apiKey: apiKey || null,
        endpoint: endpoint || null,
        userId: auth.userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Resource Added',
        details: JSON.stringify({ type, name }),
        category: 'resource',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json(
      {
        id: resource.id,
        type: resource.type,
        name: resource.name,
        config: (() => { try { return JSON.parse(resource.config); } catch { return {}; } })(),
        apiKey: resource.apiKey ? '••••••••' : null,
        endpoint: resource.endpoint,
        isActive: resource.isActive,
        createdAt: resource.createdAt,
      },
      { status: 201 }
    );
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
