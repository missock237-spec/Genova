import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';
import { validateBody, updateWorkflowSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const { id } = await params;
    const workflow = await db.workflow.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, workflow.userId, 'Workflow');
    if (ownershipError) return ownershipError;

    return secureResponse(request, NextResponse.json(workflow));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, workflow.userId, 'Workflow');
    if (ownershipError) return ownershipError;

    const body = await request.json();
    const validation = validateBody(updateWorkflowSchema, body);
    if (!validation.success) return validation.error;

    const updated = await db.workflow.update({
      where: { id },
      data: {
        ...(validation.data.name && { name: validation.data.name }),
        ...(validation.data.description !== undefined && { description: validation.data.description }),
        ...(validation.data.steps && { steps: JSON.stringify(validation.data.steps) }),
        ...(validation.data.trigger && { trigger: JSON.stringify(validation.data.trigger) }),
        ...(validation.data.status && { status: validation.data.status }),
      },
    });

    return secureResponse(request, NextResponse.json(updated));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'delete' });
    if (error) return error;

    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, workflow.userId, 'Workflow');
    if (ownershipError) return ownershipError;

    await db.workflow.delete({ where: { id } });

    await db.activityLog.create({
      data: { action: 'Workflow supprimé', details: JSON.stringify({ workflowName: workflow.name }), category: 'workflow', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json({ success: true }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
