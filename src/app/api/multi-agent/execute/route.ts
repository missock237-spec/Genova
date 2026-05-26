// Multi-Agent Execute Route — Execute a multi-agent plan with SSE

import { NextRequest, NextResponse } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { objective, agentIds, userId } = body;

    if (!objective || !agentIds || !userId) {
      return NextResponse.json({ error: 'objective, agentIds et userId requis' }, { status: 400 });
    }

    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: 'Au moins un agent est requis' }, { status: 400 });
    }

    const engine = getAgentEngine();

    // Rate limit check
    if (!engine.rateLimiter.isAllowed(`multi_agent_${userId}`, 5, 60000)) {
      return NextResponse.json({ error: 'Limite de taux dépassée. Réessayez plus tard.' }, { status: 429 });
    }

    // Validate prompt
    const validation = engine.promptValidator.validatePrompt(objective);
    if (!validation.safe && validation.threatLevel === 'critical') {
      return NextResponse.json({ error: 'Objectif rejeté pour des raisons de sécurité', risks: validation.risks }, { status: 400 });
    }

    // Verify agents exist and belong to user
    const agents = await db.agent.findMany({
      where: { id: { in: agentIds }, userId, status: 'active' },
    });

    if (agents.length === 0) {
      return NextResponse.json({ error: 'Aucun agent actif trouvé' }, { status: 404 });
    }

    // Create the plan
    const plan = await engine.agentManager.createPlan(objective, agentIds, userId);

    // Create SSE stream for execution
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'plan', plan: { id: plan.id, objective: plan.objective, agents: plan.agents, status: plan.status } })}\n\n`));

        try {
          const result = await engine.agentManager.executePlan(
            plan,
            userId,
            (agentId, step) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'step', agentId, step })}\n\n`));
            }
          );

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', plan: { id: result.id, status: result.status, results: result.results } })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Erreur inconnue' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}
