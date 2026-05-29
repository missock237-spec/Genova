import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const userId = auth.userId;

    const [
      activeAgents,
      runningTasks,
      todayValidations,
      activeWorkflows,
      totalAgents,
      totalTasks,
      totalWorkflows,
      totalGuardrails,
      socialAccounts,
      pendingApprovals,
      browserSessions,
      whatsappConfig,
      totalResources,
    ] = await Promise.all([
      db.agent.count({ where: { userId, status: 'active' } }),
      db.task.count({ where: { userId, status: 'in_progress' } }),
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
      db.socialAccount.count({ where: { userId, isActive: true } }),
      db.approvalRequest.count({ where: { userId, status: 'pending' } }),
      db.browserSession.count({ where: { userId } }),
      db.whatsAppConfig.findUnique({
        where: { userId },
        select: { isActive: true, autoMessage: true, autoCall: true },
      }),
      db.userResource.count({ where: { userId, isActive: true } }),
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

    // Social accounts by platform
    const socialAccountsByPlatform = await db.socialAccount.groupBy({
      by: ['platform'],
      where: { userId, isActive: true },
      _count: { platform: true },
    });

    // Resources by type
    const resourcesByType = await db.userResource.groupBy({
      by: ['type'],
      where: { userId, isActive: true },
      _count: { type: true },
    });

    // Recent approval requests
    const recentApprovals = await db.approvalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const res = NextResponse.json({
      activeAgents,
      runningTasks,
      todayValidations,
      activeWorkflows,
      totalAgents,
      totalTasks,
      totalWorkflows,
      totalGuardrails,
      socialAccounts,
      pendingApprovals,
      browserSessions,
      whatsappActive: whatsappConfig?.isActive ?? false,
      whatsappAutoMessage: whatsappConfig?.autoMessage ?? false,
      whatsappAutoCall: whatsappConfig?.autoCall ?? false,
      totalResources,
      recentActivities,
      tasksByStatus,
      socialAccountsByPlatform,
      resourcesByType,
      recentApprovals,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
