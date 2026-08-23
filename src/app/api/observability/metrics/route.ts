import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/observability/metrics — Métriques du système (admin)
export async function GET(request: NextRequest) {
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
    // Purger d'abord les métriques en mémoire vers le stockage
    const { flushMetrics, getMetrics } = await import('@/lib/control-plane');
    await flushMetrics();
    const metrics = await getMetrics();

    return NextResponse.json({ métriques: metrics });
  } catch (err) {
    console.error('[observability/metrics GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les métriques' },
      { status: 500 },
    );
  }
}
