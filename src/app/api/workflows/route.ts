import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const workflows = await db.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return NextResponse.json(workflows);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, steps, trigger, userId } = body;

    if (!name || !userId) {
      return NextResponse.json({ error: 'Nom et userId requis' }, { status: 400 });
    }

    const workflow = await db.workflow.create({
      data: {
        name,
        description: description || '',
        steps: steps ? JSON.stringify(steps) : '[]',
        trigger: trigger ? JSON.stringify(trigger) : '{"type":"manual"}',
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Workflow créé',
        details: JSON.stringify({ workflowName: name }),
        category: 'workflow',
        userId,
      },
    });

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
