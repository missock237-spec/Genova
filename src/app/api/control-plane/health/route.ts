import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/control-plane/health — Vérification de l'état du système
export async function GET(request: NextRequest) {
  // Health check peut être public (pas d'auth stricte) mais on tente l'auth quand même
  const { auth } = await applySecurity(request, { requireAuth: false });

  try {
    const { checkSystemHealth } = await import('@/lib/control-plane');
    const health = await checkSystemHealth();

    const status = health.healthy ? 200 : 503;
    return NextResponse.json({ santé: health }, { status });
  } catch (err) {
    console.error('[control-plane/health GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de vérifier l\'état du système' },
      { status: 503 },
    );
  }
}
