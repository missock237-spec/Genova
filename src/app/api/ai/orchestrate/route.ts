import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, userId } = body;

    if (!command || !userId) {
      return NextResponse.json({ error: 'Commande et userId requis' }, { status: 400 });
    }

    const agents = await db.agent.findMany({
      where: { userId, status: 'active' },
    });

    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Tu es l'orchestrateur AgentOS. Tu analyses les commandes en langage naturel et les transforme en plans d'action utilisant les agents IA disponibles. Réponds TOUJOURS en JSON valide avec cette structure:
{
  "understanding": "Compréhension de la demande",
  "steps": [
    { "title": "Titre de l'étape", "description": "Description", "agentType": "type d'agent suggéré", "priority": "high/medium/low" }
  ],
  "estimatedTime": "Temps estimé",
  "summary": "Résumé du plan"
}
Types d'agents disponibles: sales, support, marketing, research, rh, accounting, custom. Parle en français.`,
        },
        {
          role: 'user',
          content: `Agents disponibles: ${JSON.stringify(agents.map(a => ({ id: a.id, name: a.name, type: a.type })))}\n\nCommande: ${command}`,
        },
      ],
    });

    const responseText = completion.choices?.[0]?.message?.content || '{}';

    let plan;
    try {
      plan = JSON.parse(responseText);
    } catch {
      plan = {
        understanding: command,
        steps: [{ title: 'Analyse', description: 'Analyse de la commande', agentType: 'custom', priority: 'medium' }],
        estimatedTime: 'Non estimé',
        summary: responseText,
      };
    }

    await db.activityLog.create({
      data: {
        action: 'Commande orchestrée',
        details: JSON.stringify({ command, stepsCount: plan.steps?.length || 0 }),
        category: 'system',
        userId,
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'orchestration' }, { status: 500 });
  }
}
