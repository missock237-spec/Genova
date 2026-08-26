// ============================================================
// GET /api/dashboard — Agrégation stats pour le DashboardView
// ============================================================
//  Appelé par dashboard-view.tsx via fetch('/api/dashboard')
//  Retourne un objet DashboardStats avec les métriques clés.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const userId = auth.userId;

  // Default response — graceful degradation
  const defaults = {
    agentCount: 0,
    activeSessions: 0,
    totalTasks: 0,
    successRate: 0,
    creditsUsed: 0,
    creditsRemaining: 0,
    recentActivity: [] as { action: string; createdAt: string }[],
  };

  try {
    // [async-02] Toutes les requêtes DB sont indépendantes — Promise.allSettled
    // pour graceful degradation individuelle (certaines collections peuvent échouer).
    const [agentsResult, tasksResult, userResult, txnsResult, auditLogsResult] =
      await Promise.allSettled([
        db.agent.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
        }),
        db.task.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
        }),
        db.user.findUnique({ where: { id: userId } }),
        db.creditTransaction.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
        }),
        db.auditLog.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          take: 8,
        }),
      ]);

    // 1. Count user's agents
    const agents = agentsResult.status === 'fulfilled' ? agentsResult.value : [];
    const agentCount = (agents as unknown[]).length;

    // 2. Count user's tasks and calculate success rate
    const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
    const totalTasks = (tasks as unknown[]).length;
    const successfulTasks = (tasks as Record<string, unknown>[]).filter(
      (t) => t.status === 'completed' || t.status === 'success',
    ).length;
    const successRate = totalTasks > 0 ? Math.round((successfulTasks / totalTasks) * 100) : 0;

    // 3. Count active sessions (running tasks count as active sessions)
    const activeSessions = (tasks as Record<string, unknown>[]).filter(
      (t) => t.status === 'running' || t.status === 'in_progress',
    ).length;

    // 4. Credits info from user profile
    let creditsRemaining = 0;
    if (userResult.status === 'fulfilled' && userResult.value) {
      const u = userResult.value as Record<string, unknown>;
      creditsRemaining = (u.credits as number) || 0;
    }

    // Sum credits used from credit transactions
    let creditsUsed = 0;
    if (txnsResult.status === 'fulfilled') {
      creditsUsed = (txnsResult.value as Record<string, unknown>[]).reduce((sum, t) => {
        const amount = t.amount as number;
        return sum + (amount < 0 ? Math.abs(amount) : 0);
      }, 0);
    }

    // 5. Recent activity (last 8 actions from audit_logs)
    const recentActivity =
      auditLogsResult.status === 'fulfilled'
        ? (auditLogsResult.value as Record<string, unknown>[]).map((log) => ({
            action: (log.action as string) || 'Unknown action',
            createdAt: log.createdAt
              ? new Date(log.createdAt as string).toISOString()
              : new Date().toISOString(),
          }))
        : [];

    const res = NextResponse.json({
      agentCount,
      activeSessions,
      totalTasks,
      successRate,
      creditsUsed,
      creditsRemaining,
      recentActivity,
    });
    return secureResponse(res, request);
  } catch {
    // Complete graceful degradation — return zeros
    const res = NextResponse.json(defaults);
    return secureResponse(res, request);
  }
}
