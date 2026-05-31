/**
 * POST /api/connectors/mcp/[id]/execute — Execute an MCP tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getMCPClientManager, decryptAuthConfig } from '@/lib/connectors/mcp-client';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { toolName, args, agentId, timeoutMs } = body;

    if (!toolName) {
      const res = NextResponse.json({ error: 'toolName is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    // Get or create client
    const connector = await db.mCPConnector.findUnique({ where: { id } });
    if (!connector || connector.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const mcpManager = getMCPClientManager();

    // Try to get an existing connected client, or create one
    let client = mcpManager.getConnectedClient(id);
    if (!client) {
      const authConfig = connector.authConfig && connector.authConfig !== '{}'
        ? decryptAuthConfig(connector.authConfig)
        : {};

      client = await mcpManager.createAndConnect({
        connectorId: connector.id,
        serverUrl: connector.serverUrl,
        transportType: connector.transportType as 'sse' | 'streamable-http',
        authType: connector.authType as 'none' | 'bearer' | 'api_key' | 'oauth2' | 'basic',
        authConfig,
      });
    }

    const result = await client.callTool(toolName, args || {}, {
      agentId,
      userId: auth.userId,
      timeoutMs: timeoutMs || 30000,
    });

    const res = NextResponse.json({
      success: result.success,
      data: {
        content: result.content,
        isError: result.isError,
        executionTimeMs: result.executionTimeMs,
        metadata: result.metadata,
      },
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    }, { status: 502 });
    return secureResponse(res, request);
  }
}
