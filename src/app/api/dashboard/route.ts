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
    // [server-02] Remplacé findMany par count/aggregate + bounded queries.
    // Avant : on chargeait TOUTES les tâches (findMany) juste pour les compter.
    // Maintenant : count() pour les nombres, agrégation Firestore pour crédits,
    // et seule l'activité récente reste en findMany (déjà plafonnée à 8).
    const [agentCountResult, tasksResult, userResult, txnsCountResult, auditLogsResult] =
      await Promise.allSettled([
        db.agent.count({
          where: [{ field: 'userId', op: '==', value: userId }],
        }),
        // Pour le successRate on doit charger les statuts (pas de groupBy dans la facade)
        db.task.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
          select: ['status'],
          take: 50000, // [server-03] Plafond de sécurité
        }),
        db.user.findUnique({ where: { id: userId } }),
        // [server-02] Aggregate sur les crédits au lieu de charger toutes les transactions
        db.creditTransaction.aggregate({
          where: [{ field: 'userId', op: '==', value: userId }],
          _sum: { amount: true },
        }),
        db.auditLog.findMany({
          where: [{ field: 'userId', op: '==', value: userId }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
          take: 8,
        }),
      ]);

    // 1. Count user's agents
    const agentCount = agentCountResult.status === 'fulfilled' ? (agentCountResult.value as number) : 0;

    // 2. Count user's tasks and calculate success rate
    const tasks = tasksResult.status === 'fulfilled' ? (tasksResult.value as Record<string, unknown>[]) : [];
    const totalTasks = tasks.length;
    const successfulTasks = tasks.filter(
      (t) => t.status === 'completed' || t.status === 'success',
    ).length;
    const successRate = totalTasks > 0 ? Math.round((successfulTasks / totalTasks) * 100) : 0;

    // 3. Count active sessions (running tasks count as active sessions)
    const activeSessions = tasks.filter(
      (t) => t.status === 'running' || t.status === 'in_progress',
    ).length;

    // 4. Credits info from user profile
    let creditsRemaining = 0;
    if (userResult.status === 'fulfilled' && userResult.value) {
      const u = userResult.value as Record<string, unknown>;
      creditsRemaining = (u.credits as number) || 0;
    }

    // Sum credits used from aggregate result
    let creditsUsed = 0;
    if (txnsCountResult.status === 'fulfilled' && txnsCountResult.value) {
      const agg = txnsCountResult.value as { _sum?: { amount?: number } };
      // amount est négatif pour les utilisations → on prend la valeur absolue
      creditsUsed = Math.abs(agg._sum?.amount || 0);
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
