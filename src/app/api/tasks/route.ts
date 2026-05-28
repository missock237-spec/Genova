import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const { title, description, status, priority, agentId, workflowId } = body;
    const userId = auth.userId;

    if (!title) {
      return secureResponse(
        NextResponse.json({ error: 'Titre requis' }, { status: 400 }),
        request
      );
    }

    // Input length validation
    if (title.length > 200) {
      return secureResponse(
        NextResponse.json({ error: 'Title must be at most 200 characters' }, { status: 400 }),
        request
      );
    }

    // Validate status if provided
    const validStatuses = ['pending', 'running', 'completed', 'failed', 'validated'];
    if (status && !validStatuses.includes(status)) {
      return secureResponse(
        NextResponse.json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` }, { status: 400 }),
        request
      );
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (priority && !validPriorities.includes(priority)) {
      return secureResponse(
        NextResponse.json({ error: `Invalid priority. Allowed: ${validPriorities.join(', ')}` }, { status: 400 }),
        request
      );
    }

    // Verify agentId ownership if provided
    if (agentId) {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (!agent || agent.userId !== userId) {
        return secureResponse(
          NextResponse.json({ error: 'Agent non trouvé ou accès non autorisé' }, { status: 404 }),
          request
        );
      }
    }

    // Verify workflowId ownership if provided
    if (workflowId) {
      const workflow = await db.workflow.findUnique({ where: { id: workflowId } });
      if (!workflow || workflow.userId !== userId) {
        return secureResponse(
          NextResponse.json({ error: 'Workflow non trouvé ou accès non autorisé' }, { status: 404 }),
          request
        );
      }
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

    return secureResponse(NextResponse.json(task, { status: 201 }), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const status = request.nextUrl.searchParams.get('status');
    const workflowId = request.nextUrl.searchParams.get('workflowId');

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

    return secureResponse(NextResponse.json(tasks), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
