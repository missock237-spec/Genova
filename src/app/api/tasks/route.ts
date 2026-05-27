import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, createTaskSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(createTaskSchema, body);
    if (!validation.success) return validation.error;

    const { title, description, priority, agentId, workflowId } = validation.data;

    const task = await db.task.create({
      data: {
        title,
        description: description || null,
        status: 'pending',
        priority,
        agentId: agentId || null,
        workflowId: workflowId || null,
        userId: auth!.userId,
      },
    });

    await db.activityLog.create({
      data: { action: 'Tâche créée', details: JSON.stringify({ taskId: task.id, title }), category: 'system', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json(task, { status: 201 }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const status = request.nextUrl.searchParams.get('status');
    const workflowId = request.nextUrl.searchParams.get('workflowId');

    const where: Record<string, unknown> = { userId: auth!.userId };
    if (status) where.status = status;
    if (workflowId) where.workflowId = workflowId;

    const tasks = await db.task.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
      include: { agent: { select: { name: true, type: true } }, workflow: { select: { name: true } }, validations: true },
    });

    return secureResponse(request, NextResponse.json(tasks));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
