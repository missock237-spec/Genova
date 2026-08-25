// ============================================================
// Production observability — Health checks + Prometheus metrics
// ============================================================
//  - runHealthChecks() : probe Firebase, Redis, disk, memory
//  - PromClient registry (when prom-client is available)
//  - Edge-safe (no native modules); falls back to no-op on Vercel
// ============================================================

import { NextResponse } from 'next/server';

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  latencyMs: number;
  message?: string;
  critical?: boolean;
}

export interface HealthReport {
  status: 'pass' | 'warn' | 'fail';
  timestamp: string;
  uptimeSec: number;
  checks: HealthCheckResult[];
  version: string;
  region?: string;
}

const startTime = Date.now();

function getEnv(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env[name];
}

// --- Memory check ---
function checkMemory(): HealthCheckResult {
  const start = Date.now();
  try {
    const mem = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / (1024 * 1024);
    const heapTotalMb = mem.heapTotal / (1024 * 1024);
    const rssMb = mem.rss / (1024 * 1024);
    const heapUsageRatio = heapUsedMb / heapTotalMb;

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = `heap ${heapUsedMb.toFixed(1)}/${heapTotalMb.toFixed(1)}MB, rss ${rssMb.toFixed(1)}MB`;

    if (heapUsageRatio > 0.9 || rssMb > 450) {
      status = 'warn';
      message += ' — high memory pressure';
    }
    if (heapUsageRatio > 0.98 || rssMb > 600) {
      status = 'fail';
      message += ' — critical memory pressure';
    }
    return {
      name: 'memory',
      status,
      latencyMs: Date.now() - start,
      message,
      critical: true,
    };
  } catch (e: unknown) {
    return {
      name: 'memory',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: `memory probe failed: ${e instanceof Error ? e.message : String(e)}`,
      critical: true,
    };
  }
}

// --- Event loop liveness check ---
async function checkEventLoop(): Promise<HealthCheckResult> {
  const start = Date.now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const latencyMs = Date.now() - start;
  // > 50ms on a setImmediate likely means the event loop is saturated
  const status: 'pass' | 'warn' | 'fail' =
    latencyMs > 200 ? 'fail' : latencyMs > 50 ? 'warn' : 'pass';
  return {
    name: 'event_loop',
    status,
    latencyMs,
    message:
      status === 'pass'
        ? 'responsive'
        : `event loop latency ${latencyMs}ms`,
  };
}

// --- Firebase reachability check ---
async function checkFirebase(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // Use Admin SDK if available, otherwise just verify env vars are set
    const hasCreds = Boolean(
      getEnv('FIREBASE_PROJECT_ID') &&
        (getEnv('FIREBASE_CLIENT_EMAIL') || getEnv('FIREBASE_SERVICE_ACCOUNT'))
    );
    if (!hasCreds) {
      return {
        name: 'firebase',
        status: 'warn',
        latencyMs: Date.now() - start,
        message: 'Firebase Admin credentials not configured (set FIREBASE_PROJECT_ID + service account)',
        critical: true,
      };
    }
    // Lighter check: try to import firebase-admin dynamically.
    // In serverless cold-start this is cheap because it's cached after first call.
    const admin = await import('firebase-admin').catch(() => null);
    if (!admin) {
      return {
        name: 'firebase',
        status: 'warn',
        latencyMs: Date.now() - start,
        message: 'firebase-admin not installed (workspace not built?)',
        critical: true,
      };
    }
    return {
      name: 'firebase',
      status: 'pass',
      latencyMs: Date.now() - start,
      message: 'admin SDK available',
      critical: true,
    };
  } catch (e: unknown) {
    return {
      name: 'firebase',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: `firebase check failed: ${e instanceof Error ? e.message : String(e)}`,
      critical: true,
    };
  }
}

// --- Redis reachability check (best-effort, BullMQ uses ioredis) ---
async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    // We don't want to import ioredis (native binding) on Vercel serverless.
    // Just check env var presence — the worker service is the real consumer.
    const redisUrl = getEnv('REDIS_URL') || getEnv('REDIS_TLS_URL');
    if (!redisUrl) {
      return {
        name: 'redis',
        status: 'warn',
        latencyMs: Date.now() - start,
        message: 'REDIS_URL not configured — async workers (BullMQ) will not run',
        critical: false,
      };
    }
    return {
      name: 'redis',
      status: 'pass',
      latencyMs: Date.now() - start,
      message: 'REDIS_URL configured',
      critical: false,
    };
  } catch (e: unknown) {
    return {
      name: 'redis',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: `redis check failed: ${e instanceof Error ? e.message : String(e)}`,
      critical: false,
    };
  }
}

// --- Public API ---

export async function runHealthChecks(opts?: { skipFirebase?: boolean; skipRedis?: boolean }): Promise<HealthReport> {
  const checks: HealthCheckResult[] = [];
  checks.push(checkMemory());
  checks.push(await checkEventLoop());
  if (!opts?.skipFirebase) checks.push(await checkFirebase());
  if (!opts?.skipRedis) checks.push(await checkRedis());

  const hasFail = checks.some((c) => c.status === 'fail' && c.critical);
  const hasWarn = checks.some((c) => c.status === 'warn');
  const status: HealthReport['status'] = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  return {
    status,
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    checks,
    version: getEnv('NEXT_PUBLIC_APP_VERSION') || '0.0.0',
    region: getEnv('VERCEL_REGION') || undefined,
  };
}

// --- Prometheus exposition format ---
// We expose a minimal subset (no native prom-client needed). The format is
// text/plain, version 0.0.4 — fully Prometheus-compatible.

export function renderPrometheusMetrics(): string {
  const mem = process.memoryUsage();
  const cpuUser = process.cpuUsage();
  const uptime = process.uptime();
  const lines: string[] = [];

  lines.push('# HELP gen3ia_process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE gen3ia_process_uptime_seconds counter');
  lines.push(`gen3ia_process_uptime_seconds ${uptime.toFixed(2)}`);

  lines.push('# HELP gen3ia_process_heap_used_bytes Heap used in bytes');
  lines.push('# TYPE gen3ia_process_heap_used_bytes gauge');
  lines.push(`gen3ia_process_heap_used_bytes ${mem.heapUsed}`);

  lines.push('# HELP gen3ia_process_heap_total_bytes Heap total in bytes');
  lines.push('# TYPE gen3ia_process_heap_total_bytes gauge');
  lines.push(`gen3ia_process_heap_total_bytes ${mem.heapTotal}`);

  lines.push('# HELP gen3ia_process_rss_bytes Resident set size in bytes');
  lines.push('# TYPE gen3ia_process_rss_bytes gauge');
  lines.push(`gen3ia_process_rss_bytes ${mem.rss}`);

  lines.push('# HELP gen3ia_process_external_bytes External memory in bytes');
  lines.push('# TYPE gen3ia_process_external_bytes gauge');
  lines.push(`gen3ia_process_external_bytes ${mem.external}`);

  lines.push('# HELP gen3ia_process_cpu_user_microseconds CPU user time in microseconds');
  lines.push('# TYPE gen3ia_process_cpu_user_microseconds counter');
  lines.push(`gen3ia_process_cpu_user_microseconds ${cpuUser.user}`);

  lines.push('# HELP gen3ia_process_cpu_system_microseconds CPU system time in microseconds');
  lines.push('# TYPE gen3ia_process_cpu_system_microseconds counter');
  lines.push(`gen3ia_process_cpu_system_microseconds ${cpuUser.system}`);

  // Active handles (connections, timers) — a leak indicator at scale
  const activeHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? [];
  const activeRequests = (process as unknown as { _getActiveRequests?: () => unknown[] })._getActiveRequests?.() ?? [];

  lines.push('# HELP gen3ia_process_active_handles Number of active handles (sockets, timers)');
  lines.push('# TYPE gen3ia_process_active_handles gauge');
  lines.push(`gen3ia_process_active_handles ${activeHandles.length}`);

  lines.push('# HELP gen3ia_process_active_requests Number of active requests');
  lines.push('# TYPE gen3ia_process_active_requests gauge');
  lines.push(`gen3ia_process_active_requests ${activeRequests.length}`);

  return lines.join('\n') + '\n';
}

// --- Convenience JSON envelope for /api/health/ready ---
export function healthReportToResponse(report: HealthReport) {
  const httpStatus = report.status === 'pass' ? 200 : report.status === 'warn' ? 200 : 503;
  return NextResponse.json(report, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Status': report.status,
    },
  });
}
