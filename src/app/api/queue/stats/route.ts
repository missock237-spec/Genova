import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/queue/stats — Statistiques de la file de tâches
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { getQueueStats } = await import('@/lib/task-queue');
    const stats = await getQueueStats(auth.userId);

    return NextResponse.json({ stats });
  } catch (err) {
    console.error('[queue/stats GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les statistiques de la file' },
      { status: 500 },
    );
  }
}
