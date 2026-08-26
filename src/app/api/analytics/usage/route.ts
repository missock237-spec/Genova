// ============================================================
// GET /api/analytics/usage — Analytics de consommation
// ============================================================
//  Permet aux utilisateurs de voir :
//    - Crédits consommés par jour, semaine, mois
//    - Top agents par coût
//    - Répartition par provider IA (OpenAI, Groq, Anthropic, etc.)
//    - Coût réel en USD vs crédits
//    - Tendance (vs période précédente)
//
//  Query params :
//    - period: '7d' | '30d' | '90d' (défaut: 30d)
//    - groupBy: 'day' | 'agent' | 'provider' | 'type' (défaut: day)
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  return withAuth(request, async (auth) => {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const groupBy = searchParams.get('groupBy') || 'day';

    // Calculer la plage de dates
    const now = new Date();
    const daysBack = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Période précédente pour comparaison
    const prevStartDate = new Date();
    prevStartDate.setDate(prevStartDate.getDate() - (daysBack * 2));
    const prevEndDate = new Date();
    prevEndDate.setDate(prevEndDate.getDate() - daysBack);

    try {
      // [server-01 + async-08] Filtrer au niveau DB au lieu de tout ramener en mémoire.
      // Les deux requêtes sont indépendantes → Promise.all.
      // NOTE : l'abstraction Firestore facade ne supporte pas les filtres de date
      // complexes (gte), donc on filtre par userId seulement au niveau DB et
      // on affine la plage de dates en JS. C'est déjà beaucoup mieux que where: {}.
      // [server-03] Plafond de sécurité take: 50000 pour éviter les OOM.
      const [transactions, executions] = await Promise.all([
        db.creditTransaction.findMany({
          where: [{ field: 'userId', op: '==', value: auth.userId }],
          take: 50000,
        }),
        db.agentExecution.findMany({
          where: [{ field: 'userId', op: '==', value: auth.userId }],
          take: 50000,
        }),
      ]);

      // Filtrer par plage de dates côté JS
      const userTxns = (transactions as Record<string, unknown>[])
        .filter((t) => new Date(t.createdAt as string) >= startDate);

      const prevTxns = (transactions as Record<string, unknown>[])
        .filter((t) => {
          const tDate = new Date(t.createdAt as string);
          return tDate >= prevStartDate && tDate < prevEndDate;
        });

      // ============================================================
      // 2. Calculs agrégés
      // ============================================================
      const totalCreditsUsed = userTxns.reduce((sum, t) => {
        const amount = t.amount as number;
        return sum + (amount < 0 ? Math.abs(amount) : 0);
      }, 0);

      const totalCreditsPrev = prevTxns.reduce((sum, t) => {
        const amount = t.amount as number;
        return sum + (amount < 0 ? Math.abs(amount) : 0);
      }, 0);

      const totalUsdCost = userTxns.reduce((sum, t) => {
        try {
          const meta = JSON.parse((t.metadata as string) || '{}');
          return sum + (meta.usdCost || 0);
        } catch { return sum; }
      }, 0);

      const trendPercentage = totalCreditsPrev > 0
        ? Math.round(((totalCreditsUsed - totalCreditsPrev) / totalCreditsPrev) * 100)
        : 0;

      // ============================================================
      // 3. Groupement des données
      // ============================================================
      let grouped: Record<string, unknown> = {};

      if (groupBy === 'day') {
        const byDay: Record<string, { credits: number; usd: number; count: number }> = {};
        for (const t of userTxns) {
          const date = new Date(t.createdAt as string).toISOString().split('T')[0];
          const amount = t.amount as number;
          if (amount >= 0) continue;

          let usd = 0;
          try {
            const meta = JSON.parse((t.metadata as string) || '{}');
            usd = meta.usdCost || 0;
          } catch {}

          if (!byDay[date]) byDay[date] = { credits: 0, usd: 0, count: 0 };
          byDay[date].credits += Math.abs(amount);
          byDay[date].usd += usd;
          byDay[date].count += 1;
        }
        grouped = byDay;
      } else if (groupBy === 'agent') {
        const byAgent: Record<string, { credits: number; usd: number; executions: number }> = {};
        for (const t of userTxns) {
          let agentId = 'unknown';
          try {
            const meta = JSON.parse((t.metadata as string) || '{}');
            agentId = meta.agentId || 'unknown';
          } catch {}

          const amount = t.amount as number;
          if (amount >= 0) continue;

          let usd = 0;
          try {
            const meta = JSON.parse((t.metadata as string) || '{}');
            usd = meta.usdCost || 0;
          } catch {}

          if (!byAgent[agentId]) byAgent[agentId] = { credits: 0, usd: 0, executions: 0 };
          byAgent[agentId].credits += Math.abs(amount);
          byAgent[agentId].usd += usd;
          byAgent[agentId].executions += 1;
        }

        // Récupérer les noms d'agents
        const agentIds = Object.keys(byAgent).filter(id => id !== 'unknown');
        if (agentIds.length > 0) {
          const agents = await db.agent.findMany({
            where: { id: { in: agentIds } },
            take: agentIds.length, // [server-03] Bounded by unique IDs
          });
          const agentNames: Record<string, string> = {};
          for (const a of agents as Record<string, unknown>[]) {
            agentNames[a.id as string] = a.name as string;
          }
          const byAgentNamed: Record<string, typeof byAgent[string]> = {};
          for (const [id, data] of Object.entries(byAgent)) {
            const name = agentNames[id] || id;
            byAgentNamed[name] = data;
          }
          grouped = byAgentNamed;
        } else {
          grouped = byAgent;
        }
      } else if (groupBy === 'provider') {
        const byProvider: Record<string, { credits: number; usd: number; count: number }> = {};
        for (const t of userTxns) {
          let provider = 'unknown';
          let usd = 0;
          try {
            const meta = JSON.parse((t.metadata as string) || '{}');
            provider = meta.provider || 'unknown';
            usd = meta.usdCost || 0;
          } catch {}

          const amount = t.amount as number;
          if (amount >= 0) continue;

          if (!byProvider[provider]) byProvider[provider] = { credits: 0, usd: 0, count: 0 };
          byProvider[provider].credits += Math.abs(amount);
          byProvider[provider].usd += usd;
          byProvider[provider].count += 1;
        }
        grouped = byProvider;
      } else if (groupBy === 'type') {
        const byType: Record<string, { credits: number; count: number }> = {};
        for (const t of userTxns) {
          const resourceType = (t.resourceType as string) || 'unknown';
          const amount = t.amount as number;
          if (amount >= 0) continue;

          if (!byType[resourceType]) byType[resourceType] = { credits: 0, count: 0 };
          byType[resourceType].credits += Math.abs(amount);
          byType[resourceType].count += 1;
        }
        grouped = byType;
      }

      // ============================================================
      // 4. Exécutions d'agents — statistiques de performance
      // ============================================================
      // [server-01] Déjà filtré par userId au niveau DB ci-dessus
      const userExecs = (executions as Record<string, unknown>[])
        .filter((e) => new Date(e.createdAt as string) >= startDate);

      const totalExecutions = userExecs.length;
      const successfulExecs = userExecs.filter(e => e.status === 'completed').length;
      const failedExecs = userExecs.filter(e => e.status === 'failed').length;
      const avgDurationMs = userExecs.length > 0
        ? Math.round(userExecs.reduce((sum, e) => sum + (e.totalDuration as number || 0), 0) / userExecs.length)
        : 0;
      const avgTokensPerExec = userExecs.length > 0
        ? Math.round(userExecs.reduce((sum, e) => sum + (e.totalTokens as number || 0), 0) / userExecs.length)
        : 0;
      const successRate = totalExecutions > 0
        ? Math.round((successfulExecs / totalExecutions) * 100)
        : 0;

      // ============================================================
      // 5. Solde actuel
      // ============================================================
      const latestTxn = userTxns.length > 0
        ? userTxns.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime())[0]
        : null;
      const currentBalance = latestTxn ? (latestTxn.balance as number) : 0;

      return NextResponse.json({
        success: true,
        period,
        groupBy,
        summary: {
          totalCreditsUsed,
          totalUsdCost: Math.round(totalUsdCost * 100) / 100,
          currentBalance,
          trendPercentage,
          avgCreditsPerDay: Math.round(totalCreditsUsed / daysBack),
        },
        grouped,
        executions: {
          total: totalExecutions,
          successful: successfulExecs,
          failed: failedExecs,
          successRate,
          avgDurationMs,
          avgTokensPerExec,
        },
      });
    } catch (err) {
      console.error('[analytics] Error:', err);
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des analytics' },
        { status: 500 }
      );
    }
  });
}
