import { NextRequest, NextResponse } from 'next/server';
import { validateAction } from '@/lib/ai-router';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, aiValidateSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'ai' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(aiValidateSchema, body);
    if (!validation.success) return validation.error;

    const { action, content } = validation.data;

    const guardrails = await db.guardrail.findMany({
      where: { userId: auth!.userId, isActive: true },
    });

    if (guardrails.length === 0) {
      return secureResponse(request, NextResponse.json({ valid: true, message: 'Aucun garde-fou actif — action autorisée', details: [], severity: 'info' }));
    }

    const result = await validateAction(
      action, content || '',
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

    return secureResponse(request, NextResponse.json(validationResult));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur lors de la validation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
