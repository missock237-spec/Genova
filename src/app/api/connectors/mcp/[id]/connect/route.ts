/**
 * POST /api/connectors/mcp/[id]/connect — Connect to an MCP server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';
import { getMCPClientManager, decryptAuthConfig } from '@/lib/connectors/mcp-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const connector = await db.mCPConnector.findUnique({ where: { id } });
    if (!connector || connector.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    if (!connector.isActive) {
      const res = NextResponse.json({ error: 'Connector is inactive' }, { status: 400 });
      return secureResponse(res, request);
    }

    const authConfig = connector.authConfig && connector.authConfig !== '{}'
      ? decryptAuthConfig(connector.authConfig)
      : {};

    const mcpManager = getMCPClientManager();
    const client = await mcpManager.createAndConnect({
      connectorId: connector.id,
      serverUrl: connector.serverUrl,
      transportType: connector.transportType as 'sse' | 'streamable-http',
      authType: connector.authType as 'none' | 'bearer' | 'api_key' | 'oauth2' | 'basic',
      authConfig,
    });

    const res = NextResponse.json({
      success: true,
      data: {
        id: connector.id,
        status: 'connected',
        serverInfo: client.getServerInfo(),
        tools: client.getTools(),
        resources: client.getResources(),
        prompts: client.getPrompts(),
      },
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }, { status: 502 });
    return secureResponse(res, request);
  }
}
