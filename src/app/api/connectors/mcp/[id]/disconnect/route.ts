/**
 * POST /api/connectors/mcp/[id]/disconnect — Disconnect from an MCP server.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getMCPClientManager } from '@/lib/connectors/mcp-client';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const connector = await db.mCPConnector.findUnique({ where: { id } });
    if (!connector || connector.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const mcpManager = getMCPClientManager();
    await mcpManager.removeClient(id);

    const res = NextResponse.json({ success: true, data: { id, status: 'disconnected' } });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Disconnect failed' }, { status: 500 });
    return secureResponse(res, request);
  }
}
