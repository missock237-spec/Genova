/**
 * GET /api/connectors/mcp — List MCP connectors for the authenticated user.
 * POST /api/connectors/mcp — Create a new MCP connector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';
import { encryptAuthConfig } from '@/lib/connectors/mcp-client';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const statusFilter = request.nextUrl.searchParams.get('status');

    const connectors = await db.mCPConnector.findMany({
      where: {
        userId: auth.userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        serverUrl: true,
        transportType: true,
        status: true,
        authType: true,
        tools: true,
        resources: true,
        prompts: true,
        capabilities: true,
        serverInfo: true,
        lastConnectedAt: true,
        lastError: true,
        requestCount: true,
        avgLatencyMs: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Parse JSON fields safely
    const parsed = connectors.map(c => ({
      ...c,
      tools: safeJsonParse(c.tools, []),
      resources: safeJsonParse(c.resources, []),
      prompts: safeJsonParse(c.prompts, []),
      capabilities: safeJsonParse(c.capabilities, {}),
      serverInfo: safeJsonParse(c.serverInfo, {}),
    }));

    const stats = {
      total: connectors.length,
      connected: connectors.filter(c => c.status === 'connected').length,
      disconnected: connectors.filter(c => c.status === 'disconnected').length,
      error: connectors.filter(c => c.status === 'error').length,
      totalTools: parsed.reduce((sum, c) => sum + (c.tools as unknown[]).length, 0),
      totalResources: parsed.reduce((sum, c) => sum + (c.resources as unknown[]).length, 0),
    };

    const res = NextResponse.json({ success: true, data: { connectors: parsed, stats } });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: 'Failed to fetch MCP connectors' },
      { status: 500 }
    );
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
    const { name, description, serverUrl, transportType, authType, authConfig } = body;

    if (!name || !serverUrl) {
      const res = NextResponse.json({ error: 'name and serverUrl are required' }, { status: 400 });
      return secureResponse(res, request);
    }

    try {
      new URL(serverUrl);
    } catch {
      const res = NextResponse.json({ error: 'Invalid serverUrl' }, { status: 400 });
      return secureResponse(res, request);
    }

    const encryptedAuthConfig = authConfig && authType !== 'none'
      ? encryptAuthConfig(authConfig as Record<string, string>)
      : '{}';

    const connector = await db.mCPConnector.create({
      data: {
        name,
        description: description || '',
        serverUrl,
        transportType: ['sse', 'streamable-http'].includes(transportType) ? transportType : 'sse',
        authType: ['none', 'bearer', 'api_key', 'oauth2', 'basic'].includes(authType) ? authType : 'none',
        authConfig: encryptedAuthConfig,
        userId: auth.userId,
      },
    });

    await db.auditLog.create({
      data: {
        userId: auth.userId,
        action: 'mcp_connector_created',
        resource: 'mcp_connector',
        resourceId: connector.id,
        details: JSON.stringify({ name, serverUrl }),
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
        status: connector.status,
      },
    }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: 'Failed to create MCP connector', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

function safeJsonParse(json: string, fallback: unknown): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
