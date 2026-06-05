/**
 * GET  /api/services   — List all services with status, health, port, PID
 * POST /api/services   — Start all services (body: { action: "start_all" })
 *
 * Both endpoints require authentication via httpOnly session cookies
 * (PBKDF2 hashing) or Bearer token. Uses the project's applySecurity
 * middleware for consistent auth, CORS, and rate-limit enforcement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';
import { getServiceManager } from '@/lib/service-manager';
import { createAuditLog } from '@/lib/auth';
import { z } from 'zod';

const log = createLogger('api:services');

// ============================================================
// Validation Schemas
// ============================================================

const startAllSchema = z.object({
  action: z.literal('start_all'),
});

// ============================================================
// OPTIONS — CORS preflight
// ============================================================

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// GET /api/services — List all services
// ============================================================

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 }, // 60 req/min
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const sm = getServiceManager();
    const snapshot = sm.getSnapshot();

    log.info('Listed services', {
      userId: auth.userId,
      total: snapshot.totalServices,
      healthy: snapshot.healthyCount,
    });

    const res = NextResponse.json({
      success: true,
      data: snapshot,
    });

    return secureResponse(res, request);
  } catch (err) {
    log.error('Failed to list services', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : 'Unknown',
    });

    const res = NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve service list',
        code: 'SERVICE_LIST_ERROR',
      },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

// ============================================================
// POST /api/services — Start all services
// ============================================================

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin', // Only admins can manage services
    rateLimit: { limit: 10, windowMs: 60000 }, // 10 req/min — expensive operation
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON body',
          code: 'INVALID_BODY',
        },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const validation = startAllSchema.safeParse(body);
    if (!validation.success) {
      const res = NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Only "start_all" is supported.',
          code: 'INVALID_ACTION',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    log.info('Starting all services', {
      userId: auth.userId,
      role: auth.role,
    });

    // Execute start all via the service manager
    const sm = getServiceManager();
    await sm.startAll();

    // Get the resulting snapshot
    const snapshot = sm.getSnapshot();

    // Audit log for security-sensitive action
    await createAuditLog({
      userId: auth.userId,
      action: 'services_start_all',
      resource: 'service',
      details: {
        totalServices: snapshot.totalServices,
        healthyCount: snapshot.healthyCount,
        stoppedCount: snapshot.stoppedCount,
        failedCount: snapshot.failedCount,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
      severity: snapshot.failedCount === 0 ? 'info' : 'warning',
    });

    const allStarted = snapshot.stoppedCount === 0 && snapshot.failedCount === 0;
    const res = NextResponse.json({
      success: allStarted,
      data: snapshot,
      message: allStarted
        ? `All ${snapshot.totalServices} services started successfully`
        : `Started services: ${snapshot.healthyCount} healthy, ${snapshot.stoppedCount} stopped, ${snapshot.failedCount} failed`,
    }, {
      status: allStarted ? 200 : 207, // 207 Multi-Status for partial success
    });

    return secureResponse(res, request);
  } catch (err) {
    log.error('Failed to start all services', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : 'Unknown',
    });

    const res = NextResponse.json(
      {
        success: false,
        error: 'Failed to start services',
        code: 'SERVICE_START_ALL_ERROR',
      },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
