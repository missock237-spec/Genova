import { NextRequest, NextResponse } from 'next/server';
import { orchestrate } from '@/lib/ai-router';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, userId, conversationId } = body;

    if (!command || !userId) {
      return NextResponse.json({ error: 'Commande et userId requis' }, { status: 400 });
    }

    const agents = await db.agent.findMany({
      where: { userId, status: 'active' },
    });

    // Load conversation memory
    if (conversationId) {
      await db.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
    }

    const result = await orchestrate(
      command,
      agents.map(a => ({ id: a.id, name: a.name, type: a.type })),
      'orchestration'
    );

    let plan;
    try {
      plan = JSON.parse(result.content);
      plan._meta = { model: result.model, provider: result.provider };
    } catch {
      plan = {
        understanding: command,
        steps: [{ title: 'Analyse', description: result.content, agentType: 'custom', priority: 'medium' }],
        estimatedTime: 'Non estimé',
        summary: result.content,
        _meta: { model: result.model, provider: result.provider },
      };
    }

    // Save to conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await db.conversation.create({
        data: {
          title: command.substring(0, 50),
          type: 'orchestration',
          userId,
        },
      });
      convId = conv.id;
    }

    await db.message.createMany({
      data: [
        { role: 'user', content: command, conversationId: convId },
        { role: 'assistant', content: result.content, model: result.model, provider: result.provider, conversationId: convId },
      ],
    });

    await db.activityLog.create({
      data: {
        action: 'Commande orchestrée',
        details: JSON.stringify({ command, stepsCount: plan.steps?.length || 0, model: result.model, provider: result.provider }),
        category: 'system',
        userId,
      },
    });

    return NextResponse.json({ ...plan, conversationId: convId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur lors de l\'orchestration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
