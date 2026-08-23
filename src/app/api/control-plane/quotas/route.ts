import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/control-plane/quotas — Vérifier les quotas de l'utilisateur courant
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { getUserQuotas } = await import('@/lib/control-plane');
    const quotas = await getUserQuotas(auth.userId);

    return NextResponse.json({ quotas });
  } catch (err) {
    console.error('[control-plane/quotas GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les quotas' },
      { status: 500 },
    );
  }
}
