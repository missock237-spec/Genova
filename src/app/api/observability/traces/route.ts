import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const agentId = request.nextUrl.searchParams.get('agentId');
    const userId = auth.userId;

    if (agentId) {
      const agent = await db.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) {
        return secureResponse(NextResponse.json({ error: 'Agent non trouvé ou accès refusé' }, { status: 403 }), request);
      }
    }

    // Use AgentActionLog as trace data source
    const where: Record<string, unknown> = { userId };
    if (agentId) where.agentId = agentId;

    const actionLogs = await db.agentActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const traces = actionLogs.map(log => ({
      id: log.id,
      agentId: log.agentId,
      action: log.action,
      details: log.details,
      status: log.status,
      result: log.result,
      createdAt: log.createdAt.toISOString(),
      resolvedAt: log.resolvedAt?.toISOString(),
    }));

    // Get monitoring events as additional observability data
    const monitoringWhere: Record<string, unknown> = { userId };
    if (agentId) monitoringWhere.details = { contains: agentId };

    const recentEvents = await db.monitoringEvent.findMany({
      where: monitoringWhere,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Calculate basic metrics
    const totalActions = actionLogs.length;
    const completedActions = actionLogs.filter(l => l.status === 'completed').length;
    const failedActions = actionLogs.filter(l => l.status === 'failed').length;

    return secureResponse(NextResponse.json({
      traces,
      recentEvents,
      metrics: {
        totalActions,
        completedActions,
        failedActions,
        successRate: totalActions > 0 ? (completedActions / totalActions * 100).toFixed(1) + '%' : 'N/A',
      },
    }), request);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
