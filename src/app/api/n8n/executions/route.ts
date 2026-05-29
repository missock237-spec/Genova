/**
 * n8n Executions API
 *
 * GET /api/n8n/executions — List executions
 */

import { NextRequest, NextResponse } from 'next/server';
import { listExecutions, checkN8NHealth } from '@/lib/n8n-client';

export async function GET(request: NextRequest) {
  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'n8n service is not available' }, { status: 503 });
    }

    const workflowId = request.nextUrl.searchParams.get('workflowId') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const cursor = request.nextUrl.searchParams.get('cursor') || undefined;

    const executions = await listExecutions(workflowId, limit, cursor);
    return NextResponse.json(executions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list executions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
