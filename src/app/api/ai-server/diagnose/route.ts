/**
 * GET /api/ai-server/diagnose — Run full SaaS diagnostics
 * POST /api/ai-server/diagnose — Run diagnostics with options
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDiagnostics } from '@/lib/ai-integration-server/saas-doctor';

export async function GET() {
  try {
    const report = await runDiagnostics();

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostics failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category } = body as { category?: string };

    const report = await runDiagnostics();

    // Filter by category if specified
    if (category) {
      const filteredChecks = report.checks.filter(c => c.category === category);
      return NextResponse.json({
        success: true,
        data: {
          ...report,
          checks: filteredChecks,
          summary: {
            total: filteredChecks.length,
            healthy: filteredChecks.filter(c => c.severity === 'healthy').length,
            warnings: filteredChecks.filter(c => c.severity === 'warning').length,
            critical: filteredChecks.filter(c => c.severity === 'critical').length,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostics failed' },
      { status: 500 },
    );
  }
}
