import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/observability/logs — Journaux structurés récents depuis Firestore (admin)
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
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level') || undefined;
    const service = searchParams.get('service') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;

    const { getStructuredLogs } = await import('@/lib/control-plane');
    const logs = await getStructuredLogs({ level, service, limit });

    return NextResponse.json({ journaux: logs, total: logs.length });
  } catch (err) {
    console.error('[observability/logs GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les journaux' },
      { status: 500 },
    );
  }
}
