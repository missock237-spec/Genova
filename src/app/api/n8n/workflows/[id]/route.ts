/**
 * n8n Workflow Detail API
 *
 * GET    /api/n8n/workflows/[id] — Get workflow
 * PUT    /api/n8n/workflows/[id] — Update workflow
 * DELETE /api/n8n/workflows/[id] — Delete workflow
 * POST   /api/n8n/workflows/[id] — Activate/Deactivate workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkflow, updateWorkflow, deleteWorkflow, activateWorkflow, deactivateWorkflow } from '@/lib/n8n-client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = await getWorkflow(id);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const workflow = await updateWorkflow(id, body);
    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteWorkflow(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const workflow = body.action === 'deactivate'
      ? await deactivateWorkflow(id)
      : await activateWorkflow(id);

    return NextResponse.json(workflow);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to toggle workflow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
