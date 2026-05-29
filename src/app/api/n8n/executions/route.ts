/**
 * n8n Executions API
 *
 * GET /api/n8n/executions — List executions
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { listExecutions, checkN8NHealth } from '@/lib/n8n-client';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({ error: 'n8n service is not available' }, { status: 503 }),
        request
      );
    }

    const workflowId = request.nextUrl.searchParams.get('workflowId') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const cursor = request.nextUrl.searchParams.get('cursor') || undefined;

    const executions = await listExecutions(workflowId, limit, cursor);
    return secureResponse(NextResponse.json(executions), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list executions';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
