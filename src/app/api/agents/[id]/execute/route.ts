import { NextRequest } from 'next/server';
import { getAgentEngine } from '@/lib/agent-engine';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership } from '@/lib/security';
import { validateBody, executeAgentSchema } from '@/lib/validation';
import type { ExecutionContext } from '@/lib/agent-engine';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'aiExecute' });
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const validation = validateBody(executeAgentSchema, body);
    if (!validation.success) {
      return new Response(JSON.stringify(validation.error), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { task, context: inputContext } = validation.data;
    const maxSteps = body.maxSteps || 10;
    const conversationId = body.conversationId;

    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent) {
      return new Response(JSON.stringify({ error: 'Agent non trouvé' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const ownershipError = verifyOwnership(auth!.userId, agent.userId, 'Agent');
    if (ownershipError) return ownershipError;

    const engine = getAgentEngine();

    // Validate prompt
    const promptValidation = engine.promptValidator.validatePrompt(task);
    if (!promptValidation.safe && promptValidation.threatLevel === 'critical') {
      return new Response(JSON.stringify({ error: 'Tâche rejetée pour des raisons de sécurité', risks: promptValidation.risks }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let agentConfig: Record<string, unknown> = {};
    try { agentConfig = JSON.parse(agent.config); } catch { agentConfig = {}; }

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
      userId: auth!.userId,
      maxSteps,
      maxRetries: 3,
      steps: [],
      status: 'running',
      memory: { shortTerm: [], longTermContext: '' },
      tools: toolMapping[agent.type] || allTools,
      guardrailsActive: true,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalTokensUsed: 0,
      totalCost: 0,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', agentId: agent.id, agentName: agent.name, task })}\n\n`));
        try {
          const steps = await engine.agentManager.delegateTask(agent.id, task, '', auth!.userId,
            (step) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'step', step })}\n\n`)); }
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', steps, totalSteps: steps.length })}\n\n`));
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
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erreur serveur' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
