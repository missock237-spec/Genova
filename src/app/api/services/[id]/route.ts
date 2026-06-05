/**
 * GET  /api/services/:id   — Get specific service status and health
 * POST /api/services/:id   — Start/stop/restart a specific service
 *                            (body: { action: "start" | "stop" | "restart" })
 *
 * Requires authentication (admin role for POST actions).
 * Service ID is validated against the known service registry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';
import { getServiceManager } from '@/lib/service-manager';
import { createAuditLog } from '@/lib/auth';
import { z } from 'zod';

const log = createLogger('api:services:id');

// ============================================================
// Validation Schemas
// ============================================================

const SERVICE_ID_SCHEMA = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/, 'Service ID must contain only lowercase letters, numbers, hyphens, and underscores');

const serviceActionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
});

// ============================================================
// Route Parameter Extraction
// ============================================================

interface RouteContext {
  params: Promise<{ id: string }>;
}

function validateServiceId(rawId: string): { valid: true; id: string } | { valid: false; error: NextResponse } {
  // Basic format validation
  const formatCheck = SERVICE_ID_SCHEMA.safeParse(rawId);
  if (!formatCheck.success) {
    return {
      valid: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Invalid service ID format',
          code: 'INVALID_SERVICE_ID_FORMAT',
        },
        { status: 400 }
      ),
    };
  }

  // Registry validation — check against the service manager's known services
  const sm = getServiceManager();
  const definitions = sm.getDefinitions();
  const validIds = definitions.map((d) => d.id);

  if (!validIds.includes(rawId)) {
    return {
      valid: false,
      error: NextResponse.json(
        {
          success: false,
          error: `Service '${rawId}' not found`,
          code: 'SERVICE_NOT_FOUND',
          availableServices: validIds,
        },
        { status: 404 }
      ),
    };
  }

  return { valid: true, id: rawId };
}

// ============================================================
// OPTIONS — CORS preflight
// ============================================================

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// GET /api/services/:id — Get specific service status
// ============================================================

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 120, windowMs: 60000 }, // 120 req/min
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const idValidation = validateServiceId(id);
    if (!idValidation.valid) {
      return secureResponse(idValidation.error, request);
    }

    const sm = getServiceManager();

    // Get current status from the service manager
    const serviceStatus = sm.getStatus(idValidation.id);

    if (!serviceStatus) {
      const res = NextResponse.json(
        {
          success: false,
          error: `Service '${idValidation.id}' status unavailable`,
          code: 'SERVICE_STATUS_UNAVAILABLE',
        },
        { status: 503 }
      );
      return secureResponse(res, request);
    }

    // Perform a fresh health check alongside the status
    const healthResult = await sm.checkServiceHealth(idValidation.id);

    log.info('Retrieved service status', {
      userId: auth.userId,
      serviceId: idValidation.id,
      status: serviceStatus.status,
      healthy: healthResult.healthy,
    });

    const res = NextResponse.json({
      success: true,
      data: {
        ...serviceStatus,
        health: {
          healthy: healthResult.healthy,
          responseTimeMs: healthResult.responseTimeMs,
          lastCheckedAt: healthResult.timestamp,
          error: healthResult.error,
          data: healthResult.data,
        },
      },
    });

    return secureResponse(res, request);
  } catch (err) {
    log.error('Failed to get service status', {
      error: err instanceof Error ? err.message : 'Unknown',
    });

    const res = NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve service status',
        code: 'SERVICE_STATUS_ERROR',
      },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

// ============================================================
// POST /api/services/:id — Start/stop/restart service
// ============================================================

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: 'admin', // Only admins can manage individual services
    rateLimit: { limit: 20, windowMs: 60000 }, // 20 req/min
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const idValidation = validateServiceId(id);
    if (!idValidation.valid) {
      return secureResponse(idValidation.error, request);
    }

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

    const validation = serviceActionSchema.safeParse(body);
    if (!validation.success) {
      const res = NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Must be one of: start, stop, restart',
          code: 'INVALID_ACTION',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const { action } = validation.data;

    log.info('Service action requested', {
      userId: auth.userId,
      serviceId: idValidation.id,
      action,
    });

    // Get previous status before action
    const sm = getServiceManager();
    const previousStatus = sm.getStatus(idValidation.id);

    // Execute the requested action
    let success: boolean;
    switch (action) {
      case 'start':
        success = await sm.startService(idValidation.id);
        break;
      case 'stop':
        success = await sm.stopService(idValidation.id);
        break;
      case 'restart':
        success = await sm.restartService(idValidation.id);
        break;
    }

    // Get new status after action
    const newStatus = sm.getStatus(idValidation.id);

    const resultMessage = success
      ? `Service '${idValidation.id}' ${action} initiated successfully`
      : `Service '${idValidation.id}' ${action} failed`;

    // Audit log for security-sensitive action
    await createAuditLog({
      userId: auth.userId,
      action: `service_${action}`,
      resource: 'service',
      resourceId: idValidation.id,
      details: {
        action,
        success,
        previousStatus: previousStatus?.status || 'unknown',
        newStatus: newStatus?.status || 'unknown',
        message: resultMessage,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent') || null,
      severity: success ? 'info' : 'warning',
    });

    const res = NextResponse.json({
      success,
      data: {
        serviceId: idValidation.id,
        action,
        message: resultMessage,
        previousStatus: previousStatus?.status || 'unknown',
        newStatus: newStatus?.status || 'unknown',
        status: newStatus,
      },
    }, {
      status: success ? 200 : 422, // 422 Unprocessable Entity for action failures
    });

    return secureResponse(res, request);
  } catch (err) {
    log.error('Service action failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });

    const res = NextResponse.json(
      {
        success: false,
        error: 'Service action failed unexpectedly',
        code: 'SERVICE_ACTION_ERROR',
      },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
