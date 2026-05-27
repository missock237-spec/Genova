import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, createWorkflowSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const workflows = await db.workflow.findMany({
      where: { userId: auth!.userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return secureResponse(request, NextResponse.json(workflows));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(createWorkflowSchema, body);
    if (!validation.success) return validation.error;

    const { name, description, steps, trigger } = validation.data;

    const workflow = await db.workflow.create({
      data: { name, description: description || '', steps: JSON.stringify(steps), trigger: JSON.stringify(trigger), userId: auth!.userId },
    });

    await db.activityLog.create({
      data: { action: 'Workflow créé', details: JSON.stringify({ workflowName: name }), category: 'workflow', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json(workflow, { status: 201 }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
