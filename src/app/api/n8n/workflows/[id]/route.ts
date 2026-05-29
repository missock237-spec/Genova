/**
 * n8n Workflow Detail API
 *
 * GET    /api/n8n/workflows/[id] — Get workflow
 * PUT    /api/n8n/workflows/[id] — Update workflow
 * DELETE /api/n8n/workflows/[id] — Delete workflow
 * POST   /api/n8n/workflows/[id] — Activate/Deactivate workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getWorkflow, updateWorkflow, deleteWorkflow, activateWorkflow, deactivateWorkflow } from '@/lib/n8n-client';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const workflow = await getWorkflow(id);
    return secureResponse(NextResponse.json(workflow), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get workflow';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const workflow = await updateWorkflow(id, body);
    return secureResponse(NextResponse.json(workflow), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update workflow';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    await deleteWorkflow(id);
    return secureResponse(NextResponse.json({ success: true }), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete workflow';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const workflow = body.action === 'deactivate'
      ? await deactivateWorkflow(id)
      : await activateWorkflow(id);

    return secureResponse(NextResponse.json(workflow), request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to toggle workflow';
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request);
  }
}
