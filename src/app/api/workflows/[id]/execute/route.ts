import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: { limit: 10, windowMs: 60000 },
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });

    if (!workflow) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 }),
        request
      );
    }

    if (workflow.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    // Use atomic conditional update to prevent race condition on execution
    if (workflow.status === 'active') {
      return secureResponse(
        NextResponse.json({ error: 'Workflow déjà en cours d\'exécution' }, { status: 400 }),
        request
      );
    }

    // Atomically claim the workflow for execution
    const claimResult = await db.workflow.updateMany({
      where: { id, status: workflow.status },
      data: { status: 'active' },
    });

    if (claimResult.count === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow déjà en cours d\'exécution par une autre requête' }, { status: 409 }),
        request
      );
    }

    let steps: Array<{ title?: string; description?: string; priority?: string; agentId?: string }>;
    try {
      steps = JSON.parse(workflow.steps || '[]');
    } catch {
      return secureResponse(
        NextResponse.json({ error: 'Invalid workflow steps data' }, { status: 400 }),
        request
      );
    }

    if (steps.length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow ne contient aucune étape' }, { status: 400 }),
        request
      );
    }

    const tasks: Array<{ id: string; title: string; status: string; priority: string; agentId: string | null; workflowId: string | null }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const task = await db.task.create({
        data: {
          title: step.title || `Étape ${i + 1}`,
          description: step.description || '',
          status: i === 0 ? 'running' : 'pending',
          priority: step.priority || 'medium',
          agentId: step.agentId || null,
          workflowId: workflow.id,
          userId: workflow.userId,
        },
      });
      tasks.push(task);
    }

    // Initialize workflow tracking (status already set to 'active' by claim)
    await db.workflow.update({
      where: { id },
      data: {
        currentTaskIndex: 0,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Workflow exécuté',
        details: JSON.stringify({ workflowName: workflow.name, stepsCount: steps.length }),
        category: 'workflow',
        userId: workflow.userId,
      },
    });

    return secureResponse(
      NextResponse.json({ tasks, workflowId: workflow.id, currentTaskIndex: 0 }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: "Erreur lors de l'exécution" }, { status: 500 }),
      request
    );
  }
}

/**
 * PATCH - Advance workflow to next task
 * Body: { taskId: string, taskResult?: string }
 * Marks the current task as completed and activates the next one
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, {
      requireAuth: true,
      rateLimit: { limit: 30, windowMs: 60000 },
    });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const { taskId, taskResult } = body;

    if (!taskId) {
      return secureResponse(
        NextResponse.json({ error: 'taskId requis' }, { status: 400 }),
        request
      );
    }

    const workflow = await db.workflow.findUnique({ where: { id } });

    if (!workflow) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 }),
        request
      );
    }

    if (workflow.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    if (workflow.status !== 'active') {
      return secureResponse(
        NextResponse.json({ error: 'Workflow n\'est pas actif' }, { status: 400 }),
        request
      );
    }

    // Verify the task belongs to this workflow and is running
    const currentTask = await db.task.findFirst({
      where: { id: taskId, workflowId: id, status: 'running' },
    });

    if (!currentTask) {
      return secureResponse(
        NextResponse.json({ error: 'Tâche non trouvée ou pas en cours d\'exécution' }, { status: 400 }),
        request
      );
    }

    // Mark current task as completed
    await db.task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        result: taskResult ? String(taskResult).slice(0, 5000) : null,
      },
    });

    // Get all tasks ordered by creation time
    const allTasks = await db.task.findMany({
      where: { workflowId: id },
      orderBy: { createdAt: 'asc' },
    });

    const nextIndex = (workflow.currentTaskIndex || 0) + 1;

    if (nextIndex < allTasks.length) {
      // Activate next task
      await db.task.update({
        where: { id: allTasks[nextIndex].id },
        data: { status: 'running' },
      });

      await db.workflow.update({
        where: { id },
        data: { currentTaskIndex: nextIndex },
      });

      await db.activityLog.create({
        data: {
          action: 'Workflow étape complétée',
          details: JSON.stringify({
            workflowId: id,
            completedTaskId: taskId,
            nextTaskId: allTasks[nextIndex].id,
            progress: `${nextIndex + 1}/${allTasks.length}`,
          }),
          category: 'workflow',
          userId: auth.userId,
        },
      });

      return secureResponse(
        NextResponse.json({
          status: 'progressed',
          completedTaskId: taskId,
          nextTaskId: allTasks[nextIndex].id,
          progress: `${nextIndex + 1}/${allTasks.length}`,
          workflowComplete: false,
        }),
        request
      );
    } else {
      // All tasks completed - mark workflow as completed
      await db.workflow.update({
        where: { id },
        data: {
          status: 'completed',
          currentTaskIndex: nextIndex,
        },
      });

      await db.activityLog.create({
        data: {
          action: 'Workflow terminé',
          details: JSON.stringify({
            workflowId: id,
            totalTasks: allTasks.length,
          }),
          category: 'workflow',
          userId: auth.userId,
        },
      });

      return secureResponse(
        NextResponse.json({
          status: 'completed',
          completedTaskId: taskId,
          progress: `${allTasks.length}/${allTasks.length}`,
          workflowComplete: true,
        }),
        request
      );
    }
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la progression du workflow' }, { status: 500 }),
      request
    );
  }
}
