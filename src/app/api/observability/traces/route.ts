import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const agentId = request.nextUrl.searchParams.get('agentId');
    const userId = auth!.userId;
    const engine = getAgentEngine();

    if (agentId) {
      const agent = await db.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) {
        return NextResponse.json({ error: 'Agent non trouvé ou accès refusé' }, { status: 403 });
      }
    }

    let traces = agentId ? engine.tracer.getAgentTraces(agentId) : engine.tracer.getAllTraces();

    const where: Record<string, unknown> = { userId };
    if (agentId) where.agentId = agentId;

    const executions = await db.agentExecution.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    const dbTraces = executions.map(exec => ({
      id: exec.id, agentId: exec.agentId, task: exec.task, steps: JSON.parse(exec.steps || '[]'),
      totalDuration: exec.totalDuration, totalTokens: exec.totalTokens, estimatedCost: exec.estimatedCost,
      status: exec.status, model: exec.model, provider: exec.provider, createdAt: exec.createdAt.toISOString(),
    }));

    const inMemoryIds = new Set(traces.map(t => t.id));
    const combinedTraces = [...traces, ...dbTraces.filter(t => !inMemoryIds.has(t.id))];
    const metrics = engine.tracer.getMetrics();

    return secureResponse(request, NextResponse.json({ traces: combinedTraces, metrics }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 });
  }
}
