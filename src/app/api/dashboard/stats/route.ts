import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const [activeAgents, runningTasks, todayValidations, activeWorkflows, totalAgents, totalTasks, totalWorkflows, totalGuardrails] = await Promise.all([
      db.agent.count({ where: { userId, status: 'active' } }),
      db.task.count({ where: { userId, status: 'running' } }),
      db.validation.count({
        where: {
          task: { userId },
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.workflow.count({ where: { userId, status: 'active' } }),
      db.agent.count({ where: { userId } }),
      db.task.count({ where: { userId } }),
      db.workflow.count({ where: { userId } }),
      db.guardrail.count({ where: { userId } }),
    ]);

    const recentActivities = await db.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const tasksByStatus = await db.task.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    return NextResponse.json({
      activeAgents,
      runningTasks,
      todayValidations,
      activeWorkflows,
      totalAgents,
      totalTasks,
      totalWorkflows,
      totalGuardrails,
      recentActivities,
      tasksByStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
