/**
 * GET /api/connectors/mcp/[id] — Get MCP connector details.
 * PATCH /api/connectors/mcp/[id] — Update MCP connector.
 * DELETE /api/connectors/mcp/[id] — Delete MCP connector.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';
import { encryptAuthConfig, getMCPClientManager } from '@/lib/connectors/mcp-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const connector = await db.mCPConnector.findUnique({
      where: { id },
    });

    if (!connector || connector.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const parsed = {
      ...connector,
      tools: safeJsonParse(connector.tools, []),
      resources: safeJsonParse(connector.resources, []),
      prompts: safeJsonParse(connector.prompts, []),
      capabilities: safeJsonParse(connector.capabilities, {}),
      serverInfo: safeJsonParse(connector.serverInfo, {}),
      authConfig: '••••••••', // Never expose auth config
    };

    const res = NextResponse.json({ success: true, data: parsed });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Failed to fetch connector' }, { status: 500 });
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
    const existing = await db.mCPConnector.findUnique({ where: { id } });
    if (!existing || existing.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.serverUrl !== undefined) {
      try { new URL(body.serverUrl); updateData.serverUrl = body.serverUrl; }
      catch { /* skip invalid URL */ }
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.authConfig !== undefined && body.authType) {
      updateData.authConfig = encryptAuthConfig(body.authConfig);
      updateData.authType = body.authType;
    }

    const updated = await db.mCPConnector.update({
      where: { id },
      data: updateData,
    });

    const res = NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        isActive: updated.isActive,
      },
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json(
      { error: 'Failed to update connector' },
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
    const existing = await db.mCPConnector.findUnique({ where: { id } });
    if (!existing || existing.userId !== auth.userId) {
      const res = NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    // Disconnect client first
    try {
      const mcpManager = getMCPClientManager();
      await mcpManager.removeClient(id);
    } catch {
      // Ignore disconnect errors
    }

    await db.mCPConnector.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: auth.userId,
        action: 'mcp_connector_deleted',
        resource: 'mcp_connector',
        resourceId: id,
        details: JSON.stringify({ name: existing.name }),
        severity: 'info',
      },
    });

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Failed to delete connector' }, { status: 500 });
    return secureResponse(res, request);
  }
}

function safeJsonParse(json: string, fallback: unknown): unknown {
  try { return JSON.parse(json); } catch { return fallback; }
}
