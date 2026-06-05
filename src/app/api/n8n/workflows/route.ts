/**
 * n8n Workflows API
 *
 * GET  /api/n8n/workflows — List workflows
 * POST /api/n8n/workflows — Create a workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { listWorkflows, createWorkflow, createAgentWorkflow, checkN8NHealth } from '@/lib/n8n-client';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({ error: 'n8n service is not available' }, { status: 503 }),
        request
      );
    }

    const cursor = request.nextUrl.searchParams.get('cursor') || undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');

    const workflows = await listWorkflows(cursor, limit);
    return secureResponse(NextResponse.json(workflows), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list workflows';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const healthy = await checkN8NHealth();
    if (!healthy) {
      return secureResponse(
        NextResponse.json({ error: 'n8n service is not available' }, { status: 503 }),
        request
      );
    }

    const body = await request.json();

    if (body.agentConfig) {
      // Create a Genova agent workflow template
      const workflow = await createAgentWorkflow(body.name, body.agentConfig);
      return secureResponse(NextResponse.json(workflow, { status: 201 }), request);
    }

    // Create a custom workflow
    const workflow = await createWorkflow(body);
    return secureResponse(NextResponse.json(workflow, { status: 201 }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create workflow';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
