// ============================================================
// GET /api/health/ready — Deep readiness probe (Kubernetes-style)
// ============================================================
//  Returns 200 if all CRITICAL checks pass, 503 otherwise.
//  Used by load balancers, Vercel cron monitors, uptime checkers.
//  NOT cached. Lighter than /api/health (which only reports version).
// ============================================================

import { runHealthChecks, healthReportToResponse } from '@/lib/observability/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const report = await runHealthChecks();
  return healthReportToResponse(report);
}
