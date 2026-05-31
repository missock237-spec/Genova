/**
 * POST /api/connectors/mcp/[id]/refresh — Refresh tool/resource/prompt discovery.
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
    const client = getMCPClientManager().getConnectedClient(id);
    if (!client) {
      const res = NextResponse.json({ error: 'Connector not connected. Connect first.' }, { status: 400 });
      return secureResponse(res, request);
    }

    const capabilities = await client.refreshCapabilities();

    const res = NextResponse.json({
      success: true,
      data: capabilities,
    });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Refresh failed',
    }, { status: 500 });
    return secureResponse(res, request);
  }
}
