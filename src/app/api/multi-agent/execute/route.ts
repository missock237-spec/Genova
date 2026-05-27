import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { validateBody, multiAgentExecuteSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'aiExecute' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(multiAgentExecuteSchema, body);
    if (!validation.success) return validation.error;

    const { objective, agentIds } = validation.data;
    const userId = auth!.userId;
    const engine = getAgentEngine();

    const agents = await db.agent.findMany({ where: { id: { in: agentIds }, userId, status: 'active' } });
    if (agents.length === 0) {
      return NextResponse.json({ error: 'Aucun agent actif trouvé' }, { status: 404 });
    }

    const plan = await engine.agentManager.createPlan(objective, agentIds, userId);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'plan', plan: { id: plan.id, objective: plan.objective, agents: plan.agents, status: plan.status } })}\n\n`));
        try {
          const result = await engine.agentManager.executePlan(plan, userId, (agentId, step) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'step', agentId, step })}\n\n`));
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', plan: { id: result.id, status: result.status, results: result.results } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Erreur inconnue' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally { controller.close(); }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur serveur' }, { status: 500 });
  }
}
