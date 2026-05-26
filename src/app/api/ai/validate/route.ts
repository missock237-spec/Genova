import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, context, userId } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: 'Action et userId requis' }, { status: 400 });
    }

    const guardrails = await db.guardrail.findMany({
      where: { userId, isActive: true },
    });

    if (guardrails.length === 0) {
      return NextResponse.json({ valid: true, message: 'Aucun garde-fou actif', details: [] });
    }

    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Tu es le système de validation AgentOS. Tu vérifies si une action respecte les garde-fous définis. Réponds TOUJOURS en JSON valide:
{
  "valid": true/false,
  "message": "Message explicatif",
  "details": [{ "guardrailName": "nom", "passed": true/false, "reason": "raison" }],
  "severity": "info/warning/critical/blocking"
}
Parle en français.`,
        },
        {
          role: 'user',
          content: `Garde-fous actifs: ${JSON.stringify(guardrails.map(g => ({ name: g.name, type: g.type, rules: g.rules, severity: g.severity })))}\n\nAction à valider: ${action}\nContexte: ${context || 'Aucun'}`,
        },
      ],
    });

    const responseText = completion.choices?.[0]?.message?.content || '{}';

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { valid: true, message: 'Validation par défaut: accepté', details: [], severity: 'info' };
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la validation' }, { status: 500 });
  }
}
