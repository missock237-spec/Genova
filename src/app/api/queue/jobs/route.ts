import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/queue/jobs — Lister les tâches en file d'attente
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const { listJobs } = await import('@/lib/task-queue');
    const jobs = await listJobs(auth.userId, { status, limit, offset });

    return NextResponse.json({ jobs, total: jobs.length });
  } catch (err) {
    console.error('[queue/jobs GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les tâches' },
      { status: 500 },
    );
  }
}

// POST /api/queue/jobs — Ajouter une nouvelle tâche à la file
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.type || typeof body.type !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « type » est requis' },
        { status: 400 },
      );
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json(
        { erreur: 'Le champ « payload » est requis et doit être un objet' },
        { status: 400 },
      );
    }

    const { enqueueJob } = await import('@/lib/task-queue');
    const job = await enqueueJob({
      userId: auth.userId,
      type: body.type,
      payload: body.payload,
      priority: body.priority,
      scheduledAt: body.scheduledAt,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    console.error('[queue/jobs POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'ajout de la tâche';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
