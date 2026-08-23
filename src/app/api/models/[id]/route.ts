import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/models/[id] — Récupérer les détails d'un modèle par ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { getModel } = await import('@/lib/model-router');
    const model = await getModel(id);

    if (!model) {
      return NextResponse.json({ erreur: 'Modèle introuvable' }, { status: 404 });
    }

    return NextResponse.json({ model });
  } catch (err) {
    console.error('[models/[id] GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les détails du modèle' },
      { status: 500 },
    );
  }
}
