import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;

    // Get all agents for this user
    const agents = await db.agent.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    // Get usage stats per agent
    const agentStats = await Promise.all(
      agents.map(async (agent) => {
        const [
          usageAgg,
          costAgg,
          lastUsage,
          actionCount,
        ] = await Promise.all([
          db.agentUsage.aggregate({
            where: { agentId: agent.id },
            _sum: { tokensUsed: true, duration: true },
            _count: true,
          }),
          db.aICost.aggregate({
            where: { agentId: agent.id },
            _sum: { costUsd: true },
          }),
          db.agentUsage.findFirst({
            where: { agentId: agent.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          db.agentUsage.groupBy({
            by: ['action'],
            where: { agentId: agent.id },
            _count: { action: true },
            orderBy: { _count: { action: 'desc' } },
          }),
        ]);

        return {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          createdAt: agent.createdAt,
          totalActions: usageAgg._count,
          totalTokens: usageAgg._sum.tokensUsed || 0,
          totalDuration: usageAgg._sum.duration || 0,
          totalCost: costAgg._sum.costUsd || 0,
          lastActiveAt: lastUsage?.createdAt || null,
          actionsBreakdown: actionCount.map((a) => ({
            action: a.action,
            count: a._count.action,
          })),
        };
      })
    );

    // Sort by total actions descending
    agentStats.sort((a, b) => b.totalActions - a.totalActions);

    // Global summary
    const summary = {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === 'active').length,
      totalActions: agentStats.reduce((sum, a) => sum + a.totalActions, 0),
      totalTokens: agentStats.reduce((sum, a) => sum + a.totalTokens, 0),
      totalCost: agentStats.reduce((sum, a) => sum + a.totalCost, 0),
      totalDuration: agentStats.reduce((sum, a) => sum + a.totalDuration, 0),
    };

    return secureResponse(
      NextResponse.json({
        summary,
        agents: agentStats,
      }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
