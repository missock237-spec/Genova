/**
 * n8n Workflows API
 *
 * GET  /api/n8n/workflows — List workflows
 * POST /api/n8n/workflows — Create a workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { listWorkflows, createWorkflow, createAgentWorkflow, checkN8NHealth } from '@/lib/n8n-client';

export async function GET(request: NextRequest) {
  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'n8n service is not available' }, { status: 503 });
    }

    const cursor = request.nextUrl.searchParams.get('cursor') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');

    const workflows = await listWorkflows(cursor, limit);
    return NextResponse.json(workflows);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workflows';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return NextResponse.json({ error: 'n8n service is not available' }, { status: 503 });
    }

    const body = await request.json();

    if (body.agentConfig) {
      // Create a Genova agent workflow template
      const workflow = await createAgentWorkflow(body.name, body.agentConfig);
      return NextResponse.json(workflow, { status: 201 });
    }

    // Create a custom workflow
    const workflow = await createWorkflow(body);
    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
