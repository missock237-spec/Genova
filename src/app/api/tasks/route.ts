import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, status, priority, agentId, workflowId, userId } = body;

    if (!title || !userId) {
      return NextResponse.json({ error: 'Titre et userId requis' }, { status: 400 });
    }

    const task = await db.task.create({
      data: {
        title,
        description: description || null,
        status: status || 'pending',
        priority: priority || 'medium',
        agentId: agentId || null,
        workflowId: workflowId || null,
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Tâche créée',
        details: JSON.stringify({ taskId: task.id, title }),
        category: 'system',
        userId,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const status = request.nextUrl.searchParams.get('status');
    const workflowId = request.nextUrl.searchParams.get('workflowId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (workflowId) where.workflowId = workflowId;

    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        agent: { select: { name: true, type: true } },
        workflow: { select: { name: true } },
        validations: true,
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
