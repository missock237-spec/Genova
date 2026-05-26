import { NextRequest, NextResponse } from 'next/server';
import { validateAction } from '@/lib/ai-router';
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
      return NextResponse.json({ valid: true, message: 'Aucun garde-fou actif — action autorisée', details: [], severity: 'info' });
    }

    const result = await validateAction(
      action,
      context || '',
      guardrails.map(g => ({ name: g.name, type: g.type, rules: g.rules, severity: g.severity })),
      'validation'
    );

    let validationResult;
    try {
      validationResult = JSON.parse(result.content);
      validationResult._meta = { model: result.model, provider: result.provider };
    } catch {
      validationResult = { valid: true, message: result.content, details: [], severity: 'info', _meta: { model: result.model, provider: result.provider } };
    }

    return NextResponse.json(validationResult);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la validation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
