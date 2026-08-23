import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/models/select — Sélection automatique du meilleur modèle
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.requiredCapabilities || !Array.isArray(body.requiredCapabilities)) {
      return NextResponse.json(
        { erreur: 'Le champ « requiredCapabilities » est requis et doit être un tableau' },
        { status: 400 },
      );
    }

    const { selectModel } = await import('@/lib/model-router');
    const selected = await selectModel({
      requiredCapabilities: body.requiredCapabilities,
      maxCostPer1kInput: body.maxCostPer1kInput,
      preferredProvider: body.preferredProvider,
    });

    if (!selected) {
      return NextResponse.json(
        { erreur: 'Aucun modèle ne correspond aux critères demandés' },
        { status: 404 },
      );
    }

    return NextResponse.json({ model: selected });
  } catch (err) {
    console.error('[models/select POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la sélection du modèle';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
