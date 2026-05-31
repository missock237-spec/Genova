/**
 * GET /api/ai-server/health — Quick health check
 */

import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/ai-integration-server';

export async function GET() {
  try {
    const result = await checkHealth();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: { health: 0, status: 'critical' },
        error: error instanceof Error ? error.message : 'Health check failed',
      },
      { status: 503 },
    );
  }
}
