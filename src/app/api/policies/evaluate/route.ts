import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/policies/evaluate — Évaluer les politiques pour une action donnée
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.action || typeof body.action !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « action » est requis' },
        { status: 400 },
      );
    }

    const { evaluatePolicies } = await import('@/lib/policy-engine');
    const result = await evaluatePolicies({
      userId: auth.userId,
      action: body.action,
      resourceType: body.resourceType,
      agentId: body.agentId,
      toolId: body.toolId,
      costUsd: body.costUsd,
    });

    return NextResponse.json({ évaluation: result });
  } catch (err) {
    console.error('[policies/evaluate POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'évaluation des politiques';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
