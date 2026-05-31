/**
 * GET /api/connectors/keys — List access keys.
 * POST /api/connectors/keys — Create an access key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAccessKeyManager, getServiceDefinition, SERVICE_REGISTRY } from '@/lib/connectors/access-key-manager';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const akManager = getAccessKeyManager();
    const serviceFilter = request.nextUrl.searchParams.get('service') || undefined;
    const isActiveFilter = request.nextUrl.searchParams.get('isActive');

    const [keys, stats] = await Promise.all([
      akManager.list(auth.userId, {
        service: serviceFilter,
        isActive: isActiveFilter === 'true' ? true : isActiveFilter === 'false' ? false : undefined,
      }),
      akManager.getStats(auth.userId),
    ]);

    const res = NextResponse.json({
      success: true,
      data: {
        keys,
        stats,
        services: SERVICE_REGISTRY,
      },
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Failed to fetch access keys' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description, service, keyType, keyValue, endpoint, scopes, metadata, testEndpoint, expiresAt } = body;

    if (!name || !service || !keyValue) {
      const res = NextResponse.json(
        { error: 'name, service, and keyValue are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Auto-fill from service registry
    const serviceDef = getServiceDefinition(service);
    const resolvedKeyType = keyType || serviceDef?.defaultKeyType || 'api_key';
    const resolvedEndpoint = endpoint || serviceDef?.defaultEndpoint || null;
    const resolvedTestEndpoint = testEndpoint || serviceDef?.defaultTestEndpoint || null;

    const akManager = getAccessKeyManager();
    const accessKey = await akManager.create(auth.userId, {
      name,
      description: description || '',
      service,
      keyType: resolvedKeyType,
      keyValue,
      endpoint: resolvedEndpoint,
      scopes: scopes || serviceDef?.defaultScopes || [],
      metadata: metadata || {},
      testEndpoint: resolvedTestEndpoint,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    const res = NextResponse.json({ success: true, data: accessKey }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create access key' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
