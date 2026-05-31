/**
 * POST /api/connectors/keys/[id]/execute — Execute an API call using an access key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAccessKeyManager } from '@/lib/connectors/access-key-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { method, path, body: reqBody, queryParams, headers, agentId, timeoutMs } = body;

    if (!path) {
      const res = NextResponse.json({ error: 'path is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    const akManager = getAccessKeyManager();
    const result = await akManager.execute(auth.userId, id, {
      method: method || 'GET',
      path,
      body: reqBody,
      queryParams,
      headers,
      agentId,
      timeoutMs: timeoutMs || 30000,
    });

    const res = NextResponse.json({
      success: result.success,
      data: result.data,
      error: result.error,
      metadata: {
        statusCode: result.statusCode,
        executionTimeMs: result.executionTimeMs,
        rateLimitInfo: result.rateLimitInfo,
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
