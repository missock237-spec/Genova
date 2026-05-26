// Observability Traces Route — Get execution traces

import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentId = searchParams.get('agentId');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const engine = getAgentEngine();

    // Get in-memory traces
    let traces = agentId
      ? engine.tracer.getAgentTraces(agentId)
      : engine.tracer.getAllTraces();

    // Also get historical executions from database
    const where: Record<string, unknown> = { userId };
    if (agentId) where.agentId = agentId;

    const executions = await db.agentExecution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const dbTraces = executions.map(exec => ({
      id: exec.id,
      agentId: exec.agentId,
      task: exec.task,
      steps: JSON.parse(exec.steps || '[]'),
      totalDuration: exec.totalDuration,
      totalTokens: exec.totalTokens,
      estimatedCost: exec.estimatedCost,
      status: exec.status,
      model: exec.model,
      provider: exec.provider,
      createdAt: exec.createdAt.toISOString(),
    }));

    // Combine and deduplicate
    const inMemoryIds = new Set(traces.map(t => t.id));
    const combinedTraces = [
      ...traces,
      ...dbTraces.filter(t => !inMemoryIds.has(t.id)),
    ];

    // Get metrics
    const metrics = engine.tracer.getMetrics();

    return NextResponse.json({
      traces: combinedTraces,
      metrics,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
