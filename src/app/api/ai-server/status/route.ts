/**
 * GET /api/ai-server/status — AI Integration Server status and pipeline progress
 */

import { NextResponse } from 'next/server';
import { getServerStatus } from '@/lib/ai-integration-server';

export async function GET() {
  try {
    const status = getServerStatus();

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get server status' },
      { status: 500 },
    );
  }
}
