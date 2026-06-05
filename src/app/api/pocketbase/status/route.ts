/**
 * PocketBase Status API
 *
 * GET /api/pocketbase/status — Get PocketBase health and collections info
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { checkPocketBaseHealth, listCollections, initializeGenovaCollections } from '@/lib/pocketbase-client';

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
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({
          connected: false,
          status: 'unavailable',
          message: 'PocketBase service is not running',
        }),
        request
      );
    }

    // Try to initialize Genova collections if PocketBase is available
    try {
      await initializeGenovaCollections();
    } catch {
      // Collections may already exist or auth may be needed — non-fatal
    }

    const collections = await listCollections();
    return secureResponse(
      NextResponse.json({
        connected: true,
        status: 'healthy',
        collectionCount: collections.length,
        collections: collections.map(c => ({ name: c.name, type: c.type })),
      }),
      request
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check PocketBase status';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
