/**
 * Prometheus Metrics Scrape Endpoint
 *
 * GET /api/monitoring/metrics
 *
 * Exposes all Genova.AI metrics in Prometheus exposition format
 * for scraping by Prometheus server.
 *
 * This endpoint is excluded from OpenTelemetry tracing to avoid noise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetrics, getMetricsContentType } from '@/lib/monitoring/metrics';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const metricsText = await getMetrics();
    const contentType = getMetricsContentType();

    return new NextResponse(metricsText, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect metrics', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
