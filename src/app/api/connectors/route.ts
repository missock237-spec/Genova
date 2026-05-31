/**
 * GET /api/connectors — List all connectors (MCP + Access Keys) for the authenticated user.
 * POST /api/connectors — Create a new connector (MCP or Access Key).
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getConnectorRegistry } from '@/lib/connectors/connector-registry';
import { getMCPClientManager, encryptAuthConfig } from '@/lib/connectors/mcp-client';
import { getAccessKeyManager } from '@/lib/connectors/access-key-manager';
import { db } from '@/lib/db';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const registry = getConnectorRegistry();
    const typeParam = request.nextUrl.searchParams.get('type') as 'mcp' | 'access_key' | null;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const isActiveParam = request.nextUrl.searchParams.get('isActive');
    const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

    const [connectors, stats] = await Promise.all([
      registry.listAll(auth.userId, { type: typeParam || undefined, search, isActive }),
      registry.getStats(auth.userId),
    ]);

    const res = NextResponse.json({ success: true, data: { connectors, stats } });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: 'Failed to fetch connectors', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
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
    const { connectorType } = body;

    if (!connectorType || !['mcp', 'access_key'].includes(connectorType)) {
      const res = NextResponse.json(
        { error: 'connectorType is required and must be "mcp" or "access_key"' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (connectorType === 'mcp') {
      return await createMCPConnector(request, auth.userId, body);
    } else {
      return await createAccessKey(request, auth.userId, body);
    }
  } catch (error) {
    const res = NextResponse.json(
      { error: 'Failed to create connector', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

async function createMCPConnector(
  request: NextRequest,
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const { name, description, serverUrl, transportType, authType, authConfig } = body;

  if (!name || !serverUrl) {
    const res = NextResponse.json(
      { error: 'name and serverUrl are required' },
      { status: 400 }
    );
    return secureResponse(res, request);
  }

  if (typeof name !== 'string' || name.length > 100) {
    const res = NextResponse.json(
      { error: 'name must be a string with at most 100 characters' },
      { status: 400 }
    );
    return secureResponse(res, request);
  }

  // Validate URL
  try {
    new URL(serverUrl as string);
  } catch {
    const res = NextResponse.json({ error: 'serverUrl must be a valid URL' }, { status: 400 });
    return secureResponse(res, request);
  }

  const validTransportTypes = ['sse', 'streamable-http'];
  const resolvedTransportType = validTransportTypes.includes(transportType as string)
    ? transportType as string
    : 'sse';

  const validAuthTypes = ['none', 'bearer', 'api_key', 'oauth2', 'basic'];
  const resolvedAuthType = validAuthTypes.includes(authType as string)
    ? authType as string
    : 'none';

  // Encrypt auth config
  const encryptedAuthConfig = authConfig && resolvedAuthType !== 'none'
    ? encryptAuthConfig(authConfig as Record<string, string>)
    : '{}';

  const connector = await db.mCPConnector.create({
    data: {
      name: name as string,
      description: (description as string) || '',
      serverUrl: serverUrl as string,
      transportType: resolvedTransportType,
      authType: resolvedAuthType,
      authConfig: encryptedAuthConfig,
      userId,
    },
  });

  // Log creation
  await db.auditLog.create({
    data: {
      userId,
      action: 'mcp_connector_created',
      resource: 'mcp_connector',
      resourceId: connector.id,
      details: JSON.stringify({ name, serverUrl, transportType: resolvedTransportType }),
      severity: 'info',
    },
  });

  const res = NextResponse.json({
    success: true,
    data: {
      id: connector.id,
      name: connector.name,
      serverUrl: connector.serverUrl,
      transportType: connector.transportType,
      authType: connector.authType,
      status: connector.status,
      createdAt: connector.createdAt,
    },
  }, { status: 201 });

  return secureResponse(res, request);
}

async function createAccessKey(
  request: NextRequest,
  userId: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const { name, description, service, keyType, keyValue, endpoint, scopes, metadata, testEndpoint, expiresAt } = body;

  if (!name || !service || !keyValue) {
    const res = NextResponse.json(
      { error: 'name, service, and keyValue are required' },
      { status: 400 }
    );
    return secureResponse(res, request);
  }

  const akManager = getAccessKeyManager();

  const accessKey = await akManager.create(userId, {
    name: name as string,
    description: (description as string) || undefined,
    service: service as string,
    keyType: (keyType as 'api_key' | 'bearer_token' | 'oauth2' | 'basic_auth' | 'custom') || 'api_key',
    keyValue: keyValue as string,
    endpoint: (endpoint as string) || undefined,
    scopes: scopes as string[] | undefined,
    metadata: metadata as Record<string, unknown> | undefined,
    testEndpoint: (testEndpoint as string) || undefined,
    expiresAt: expiresAt ? new Date(expiresAt as string) : undefined,
  });

  const res = NextResponse.json({
    success: true,
    data: accessKey,
  }, { status: 201 });

  return secureResponse(res, request);
}
