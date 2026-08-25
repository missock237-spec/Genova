// ============================================================
// GET /api/metrics/system — Process-level Prometheus metrics
// ============================================================
//  Scrape target for Prometheus / Grafana. Returns PROCESS metrics
//  (memory, CPU, handles, uptime) in text/plain exposition format
//  v0.0.4. Protected by METRICS_TOKEN or CRON_SECRET.
//
//  NOTE: Application-level metrics (agents, executions, credits...)
//  live at /api/metrics (separate route, uses Firestore + applySecurity).
//  This route is intentionally process-only → ultra-cheap, no DB calls,
//  safe to scrape every 5s without load impact.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { renderPrometheusMetrics } from '@/lib/observability/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  // Auth: bearer token OR x-cron-secret — fall back to public if no token configured
  const expectedToken = process.env.METRICS_TOKEN || process.env.CRON_SECRET;
  if (expectedToken) {
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    const cronSecret = req.headers.get('x-cron-secret');
    if (bearer !== expectedToken && cronSecret !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  const body = renderPrometheusMetrics();
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
