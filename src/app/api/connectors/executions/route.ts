/**
 * GET /api/connectors/executions — Get execution history for connectors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getConnectorRegistry } from '@/lib/connectors/connector-registry';

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

    const connectorId = request.nextUrl.searchParams.get('connectorId') || undefined;
    const connectorType = request.nextUrl.searchParams.get('connectorType') as 'mcp' | 'access_key' | null;
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const result = await registry.getExecutionHistory(auth.userId, {
      connectorId,
      connectorType: connectorType || undefined,
      status,
      limit: Math.min(limit, 100),
      offset,
    });

    const res = NextResponse.json({ success: true, data: result });
    return secureResponse(res, request);
  } catch (error) {
    const res = NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
    return secureResponse(res, request);
  }
}
