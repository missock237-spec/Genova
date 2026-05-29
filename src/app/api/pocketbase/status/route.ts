/**
 * PocketBase Status API
 *
 * GET /api/pocketbase/status — Get PocketBase health and collections info
 */

import { NextResponse } from 'next/server';
import { checkPocketBaseHealth, listCollections, initializeGenovaCollections } from '@/lib/pocketbase-client';

export async function GET() {
  try {
    const healthy = await checkPocketBaseHealth();
    if (!healthy) {
      return NextResponse.json({
        connected: false,
        status: 'unavailable',
        message: 'PocketBase service is not running',
      });
    }

    // Try to initialize Genova collections if PocketBase is available
    try {
      await initializeGenovaCollections();
    } catch {
      // Collections may already exist or auth may be needed — non-fatal
    }

    const collections = await listCollections();
    return NextResponse.json({
      connected: true,
      status: 'healthy',
      collectionCount: collections.length,
      collections: collections.map(c => ({ name: c.name, type: c.type })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check PocketBase status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
