import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { validateBody, createGuardrailSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const guardrails = await db.guardrail.findMany({
      where: { userId: auth!.userId },
      orderBy: { createdAt: 'desc' },
    });

    return secureResponse(request, NextResponse.json(guardrails));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const body = await request.json();
    const validation = validateBody(createGuardrailSchema, body);
    if (!validation.success) return validation.error;

    const { name, type, description, rules, severity } = validation.data;

    const guardrail = await db.guardrail.create({
      data: { name, type, description: description || '', rules: JSON.stringify(rules), severity, userId: auth!.userId },
    });

    await db.activityLog.create({
      data: { action: 'Garde-fou créé', details: JSON.stringify({ guardrailName: name, type }), category: 'guardrail', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json(guardrail, { status: 201 }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
