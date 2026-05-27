import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'aiExecute' });
    if (error) return error;

    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });
    if (!workflow) {
      return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, workflow.userId, 'Workflow');
    if (ownershipError) return ownershipError;

    const steps = JSON.parse(workflow.steps || '[]');
    const tasks: Array<{ id: string; title: string; status: string; [key: string]: unknown }> = [];

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
          userId: auth!.userId,
        },
      });
      tasks.push(task);
    }

    await db.workflow.update({ where: { id }, data: { status: 'active' } });

    await db.activityLog.create({
      data: { action: 'Workflow exécuté', details: JSON.stringify({ workflowName: workflow.name, stepsCount: steps.length }), category: 'workflow', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json({ tasks, workflowId: workflow.id }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'exécution' }, { status: 500 });
  }
}
