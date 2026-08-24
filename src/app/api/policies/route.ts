import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/policies — Lister les politiques
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';

    const { listPolicies } = await import('@/lib/policy-engine');
    const policies = await listPolicies({ activeOnly });

    return NextResponse.json({ politiques: policies, total: policies.length });
  } catch (err) {
    console.error('[policies GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les politiques' },
      { status: 500 },
    );
  }
}

// POST /api/policies — Créer une politique (admin uniquement)
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json(
      { erreur: 'Accès réservé aux administrateurs' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « name » est requis' },
        { status: 400 },
      );
    }
    if (!body.action || typeof body.action !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « action » est requis' },
        { status: 400 },
      );
    }
    if (body.effect === undefined || !['allow', 'deny'].includes(body.effect)) {
      return NextResponse.json(
        { erreur: 'Le champ « effect » est requis et doit être « allow » ou « deny »' },
        { status: 400 },
      );
    }

    const { createPolicy } = await import('@/lib/policy-engine');
    const policy = await createPolicy(body);

    return NextResponse.json({ politique: policy }, { status: 201 });
  } catch (err) {
    console.error('[policies POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la création de la politique';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
