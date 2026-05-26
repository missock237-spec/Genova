// Agent Execute Route — Execute agent with ReAct loop (SSE streaming)

import { NextRequest } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';
import type { ExecutionContext } from '@/lib/agent-engine';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { task, maxSteps = 10, conversationId } = body;

    if (!task) {
      return new Response(JSON.stringify({ error: 'Tâche requise' }), { status: 400 });
    }

    // Get agent
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent non trouvé' }), { status: 404 });
    }

    const engine = getAgentEngine();

    // Rate limit check
    if (!engine.rateLimiter.isAllowed(`agent_exec_${agent.userId}`, 10, 60000)) {
      return new Response(JSON.stringify({ error: 'Limite de taux dépassée. Réessayez dans un moment.' }), { status: 429 });
    }

    // Validate prompt
    const validation = engine.promptValidator.validatePrompt(task);
    if (!validation.safe && validation.threatLevel === 'critical') {
      return new Response(JSON.stringify({ error: 'Tâche rejetée pour des raisons de sécurité', risks: validation.risks }), { status: 400 });
    }

    // Build execution context
    let agentConfig: Record<string, unknown> = {};
    try {
      agentConfig = JSON.parse(agent.config);
    } catch {
      agentConfig = {};
    }

    // Get tools for agent type
    const allTools = engine.toolRegistry.getToolNames();
    const toolMapping: Record<string, string[]> = {
      sales: ['web_search', 'database_query', 'calculator'],
      support: ['database_query', 'web_search'],
      marketing: ['web_search', 'calculator', 'database_query'],
      research: ['web_search', 'database_query', 'filesystem'],
      rh: ['database_query', 'calculator'],
      accounting: ['calculator', 'database_query'],
      custom: allTools,
    };

    const context: ExecutionContext = {
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      agentConfig,
      task,
      conversationId,
      userId: agent.userId,
      maxSteps,
      steps: [],
      status: 'running',
      memory: { shortTerm: [], longTermContext: '' },
      tools: toolMapping[agent.type] || allTools,
      guardrailsActive: true,
    };

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send initial event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', agentId: agent.id, agentName: agent.name, task })}\n\n`));

        try {
          const steps = await engine.agentManager.delegateTask(
            agent.id,
            task,
            '',
            agent.userId,
            (step) => {
              // Stream each step as an SSE event
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'step', step })}\n\n`));
            }
          );

          // Send completion event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', steps, totalSteps: steps.length })}\n\n`));
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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
