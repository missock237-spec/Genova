import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = await db.workflow.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    return NextResponse.json(workflow);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const workflow = await db.workflow.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.steps && { steps: JSON.stringify(body.steps) }),
        ...(body.trigger && { trigger: JSON.stringify(body.trigger) }),
        ...(body.status && { status: body.status }),
      },
    });

    return NextResponse.json(workflow);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    await db.workflow.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Workflow supprimé',
        details: JSON.stringify({ workflowName: workflow.name }),
        category: 'workflow',
        userId: workflow.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
