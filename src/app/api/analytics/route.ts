// ============================================================
// GET /api/analytics — Analytics agrégés pour AnalyticsView
// ============================================================
//  Appelé par analytics-view.tsx via fetch('/api/analytics?period=30d')
//  Agrège les données de crédit et d'exécution en une seule réponse.
//
//  Correctifs :
//   - Les collections credit_transactions / agent_executions ne sont
//     plus chargées en intégralité : filtre userId côté serveur.
//   - Le filtre de date reste en mémoire (évite l'index composite
//     userId+createdAt et tolère les dates historiques corrompues).
//   - topAgents : la requête `where: id in [...]` ne pouvait jamais
//     matcher ('id' est l'identifiant du document, pas un champ de
//     données) — les noms d'agents sont désormais résolus par
//     lectures directes parallèles sur le top 10 par volume.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import type { WhereInput } from '@/lib/db';

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
  const period = request.nextUrl.searchParams.get('period') || '30d';

  // Calculate date range
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[period] || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  try {
    // ============================================================
    // 1. Fetch credit transactions (for creditsUsed, totalCost)
    //    Filtre userId côté serveur — ne charge plus toute la collection.
    // ============================================================
    // [server-03] Plafond de sécurité pour éviter les OOM
    const transactions = await db.creditTransaction.findMany({
      where: [{ field: 'userId', op: '==', value: userId }],
      take: 50000,
    });
    const userTxns = (transactions as Record<string, unknown>[])
      .filter((t) => {
        const d = new Date(t.createdAt as string);
        return !Number.isNaN(d.getTime()) && d >= startDate;
      });

    const creditsUsed = userTxns.reduce((sum, t) => {
      const amount = t.amount as number;
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);

    const totalCost = userTxns.reduce((sum, t) => {
      try {
        const meta = JSON.parse((t.metadata as string) || '{}');
        return sum + (meta.usdCost || 0);
      } catch {
        return sum;
      }
    }, 0);

    // ============================================================
    // 2. Fetch AI costs (for token counts, cost breakdown)
    // ============================================================
    let totalTokens = 0;
    let totalCalls = 0;
    let totalLatency = 0;
    try {
      const aiCosts = await db.aICost.findMany({
        where: [{ field: 'userId', op: '==', value: userId }],
        take: 50000, // [server-03] Plafond de sécurité
      });
      for (const cost of aiCosts as Record<string, unknown>[]) {
        const d = new Date(cost.createdAt as string);
        if (Number.isNaN(d.getTime()) || d < startDate) continue;
        totalTokens += (cost.totalTokens as number) || 0;
        totalCalls += 1;
        totalLatency += (cost.latencyMs as number) || 0;
      }
    } catch {
      // Graceful: leave at 0
    }

    // ============================================================
    // 3. Fetch agent executions (for success rate, top agents)
    //    Filtre userId côté serveur — ne charge plus toute la collection.
    // ============================================================
    let successRate = 0;
    let topAgents: { name: string; executions: number }[] = [];
    let agentExecutions: Record<string, unknown>[] = [];

    try {
      const myExecs = await db.agentExecution.findMany({
        where: [{ field: 'userId', op: '==', value: userId }],
        take: 50000, // [server-03] Plafond de sécurité
      });
      agentExecutions = (myExecs as Record<string, unknown>[]).filter((e) => {
        const d = new Date(e.createdAt as string);
        return !Number.isNaN(d.getTime()) && d >= startDate;
      });

      const completed = agentExecutions.filter(
        (e) => e.status === 'completed',
      ).length;
      const failed = agentExecutions.filter(
        (e) => e.status === 'failed',
      ).length;
      const total = completed + failed;
      successRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      // Group by agent for top agents
      const agentCountMap = new Map<string, number>();
      for (const exec of agentExecutions) {
        const agentId = exec.agentId as string;
        if (!agentId) continue;
        agentCountMap.set(agentId, (agentCountMap.get(agentId) || 0) + 1);
      }

      // Noms des agents : impossible de filtrer sur le champ 'id'
      // (c'est l'identifiant du document, pas un champ de données) —
      // on résout le top 10 par volume en lectures directes parallèles.
      if (agentCountMap.size > 0) {
        const topIds = Array.from(agentCountMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([id]) => id);

        const agents = await Promise.all(
          topIds.map((agentId) =>
            db.agent
              .findUnique({ where: { id: agentId }, select: ['name'] })
              .catch(() => null),
          ),
        );
        const nameMap = new Map<string, string>();
        agents.forEach((a, i) => {
          const id = topIds[i];
          if (a && id) nameMap.set(id, ((a as Record<string, unknown>).name as string) || id);
        });

        topAgents = topIds.map((id) => ({
          name: nameMap.get(id) || id,
          executions: agentCountMap.get(id) || 0,
        }));
      }
    } catch {
      // Graceful: empty arrays
    }

    // ============================================================
    // 4. Daily usage (from credit transactions)
    // ============================================================
    const usageByDay: { date: string; count: number }[] = [];
    const dayMap = new Map<string, number>();
    for (const t of userTxns) {
      const dateStr = new Date(t.createdAt as string).toISOString().split('T')[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    }
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      usageByDay.push({ date: key, count: dayMap.get(key) || 0 });
    }

    // ============================================================
    // 5. Agent & task counts (agrégation count() côté serveur)
    // ============================================================
    let totalAgents = 0;
    let totalTasks = 0;
    try {
      const whereUser: WhereInput = [{ field: 'userId', op: '==', value: userId }];
      [totalAgents, totalTasks] = await Promise.all([
        db.agent.count({ where: whereUser }),
        db.task.count({ where: whereUser }),
      ]);
    } catch {
      // Graceful: leave at 0
    }

    // ============================================================
    // 6. Build response matching AnalyticsData interface
    // ============================================================
    const avgResponseTime = totalCalls > 0 ? totalLatency / totalCalls : 0;

    const data = {
      period,
      totalUsers: 1, // Single-user analytics (the current user)
      totalAgents,
      totalTasks,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000, // 4 decimal places
      successRate,
      totalMessages: totalCalls,
      totalVoiceCalls: 0, // Not tracked yet
      avgResponseTime: Math.round(avgResponseTime),
      dailyActiveUsers: 1, // Single-user view
      topAgents,
      usageByDay,
    };

    const res = NextResponse.json(data);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json({
      period,
      totalUsers: 0,
      totalAgents: 0,
      totalTasks: 0,
      totalTokens: 0,
      totalCost: 0,
      successRate: 0,
      totalMessages: 0,
      totalVoiceCalls: 0,
      avgResponseTime: 0,
      dailyActiveUsers: 0,
      topAgents: [],
      usageByDay: [],
    });
    return secureResponse(res, request);
  }
}
