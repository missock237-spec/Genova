/**
 * GET /api/services/health — Aggregated health check for all services
 *
 * Returns a consolidated view of all microservice health statuses.
 * Used for monitoring dashboards, uptime reporting, and alerting.
 *
 * Requires authentication. Returns a 503 when the overall system
 * health is degraded or unhealthy, allowing load balancers and
 * monitoring tools to detect outages via HTTP status codes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';
import { getServiceManager } from '@/lib/service-manager';

const log = createLogger('api:services:health');

// ============================================================
// OPTIONS — CORS preflight
// ============================================================

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

// ============================================================
// GET /api/services/health — Aggregated health check
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
    const definitions = sm.getDefinitions();

    // Perform health checks for all services in parallel
    const healthResults = await Promise.all(
      definitions.map(async (def) => {
        const healthEvent = await sm.checkServiceHealth(def.id);
        const status = sm.getStatus(def.id);

        return {
          serviceId: def.id,
          name: def.name,
          port: def.port,
          category: def.category,
          description: def.description,
          healthy: healthEvent.healthy,
          status: status?.status || 'unknown',
          responseTimeMs: healthEvent.responseTimeMs,
          error: healthEvent.error,
          data: healthEvent.data,
          pid: status?.pid,
          uptimeMs: status?.uptimeMs || 0,
          lastHealthCheckAt: status?.lastHealthCheckAt,
          lastHealthyAt: status?.lastHealthyAt,
        };
      })
    );

    // Compute aggregates
    const totalServices = healthResults.length;
    const healthyCount = healthResults.filter((r) => r.healthy).length;
    const unhealthyCount = healthResults.filter((r) => !r.healthy).length;

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (totalServices === 0) {
      overallStatus = 'unhealthy';
    } else if (healthyCount === totalServices) {
      overallStatus = 'healthy';
    } else if (healthyCount === 0) {
      overallStatus = 'unhealthy';
    } else {
      overallStatus = 'degraded';
    }

    // Determine HTTP status based on overall health
    const httpStatus = overallStatus === 'healthy' ? 200 : 503;

    log.info('Health check completed', {
      userId: auth.userId,
      overallStatus,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
    });

    const res = NextResponse.json(
      {
        success: overallStatus !== 'unhealthy',
        data: {
          status: overallStatus,
          totalServices,
          healthy: healthyCount,
          unhealthy: unhealthyCount,
          checkedAt: new Date().toISOString(),
          services: healthResults,
        },
      },
      { status: httpStatus }
    );

    return secureResponse(res, request);
  } catch (err) {
    log.error('Health check failed', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : 'Unknown',
    });

    const res = NextResponse.json(
      {
        success: false,
        error: 'Health check failed',
        code: 'HEALTH_CHECK_ERROR',
        data: {
          status: 'unknown',
          totalServices: 0,
          healthy: 0,
          unhealthy: 0,
          checkedAt: new Date().toISOString(),
          services: [],
        },
      },
      { status: 503 }
    );
    return secureResponse(res, request);
  }
}
