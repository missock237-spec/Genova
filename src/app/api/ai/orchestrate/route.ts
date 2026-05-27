import { NextRequest, NextResponse } from 'next/server';
import { orchestrate } from '@/lib/ai-router';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, aiOrchestrateSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'ai' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(aiOrchestrateSchema, body);
    if (!validation.success) return validation.error;

    const { command, agentIds } = validation.data;
    const userId = auth!.userId;

    const agents = await db.agent.findMany({
      where: { userId, status: 'active', ...(agentIds ? { id: { in: agentIds } } : {}) },
    });

    const result = await orchestrate(
      command, agents.map(a => ({ id: a.id, name: a.name, type: a.type })), 'orchestration'
    );

    let plan;
    try {
      plan = JSON.parse(result.content);
      plan._meta = { model: result.model, provider: result.provider };
    } catch {
      plan = { understanding: command, steps: [{ title: 'Analyse', description: result.content, agentType: 'custom', priority: 'medium' }], estimatedTime: 'Non estimé', summary: result.content, _meta: { model: result.model, provider: result.provider } };
    }

    const conv = await db.conversation.create({ data: { title: command.substring(0, 50), type: 'orchestration', userId } });
    await db.message.createMany({ data: [
      { role: 'user', content: command, conversationId: conv.id },
      { role: 'assistant', content: result.content, model: result.model, provider: result.provider, conversationId: conv.id },
    ] });

    await db.activityLog.create({
      data: { action: 'Commande orchestrée', details: JSON.stringify({ command, stepsCount: plan.steps?.length || 0, model: result.model, provider: result.provider }), category: 'system', userId },
    });

    return secureResponse(request, NextResponse.json({ ...plan, conversationId: conv.id }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'orchestration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
