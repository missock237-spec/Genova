/**
 * PocketBase Service API Route — Health & status checks
 *
 * GET  /api/services/pocketbase  →  Check PocketBase health status
 *
 * Requires authentication via applySecurity.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { pocketBase } from '@/lib/pocketbase-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:pocketbase');

export async function GET(request: NextRequest) {
  // Apply security — require authentication
  const { error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60_000 },
  });

  if (secError) return secError;

  try {
    const healthy = await pocketBase.health();
    const baseUrl = pocketBase.getBaseUrl();
    const authenticated = pocketBase.isAuthenticated();

    const response = NextResponse.json({
      status: healthy ? 'healthy' : 'unhealthy',
      pocketbaseUrl: baseUrl,
      authenticated,
      timestamp: new Date().toISOString(),
      message: healthy
        ? 'PocketBase is reachable and healthy'
        : 'PocketBase is unreachable or unhealthy',
    }, { status: healthy ? 200 : 503 });

    return secureResponse(response, request);
  } catch (err) {
    log.error('PocketBase health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response = NextResponse.json({
      status: 'error',
      message: 'Failed to check PocketBase health',
      timestamp: new Date().toISOString(),
    }, { status: 500 });

    return secureResponse(response, request);
  }
}
