import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/orchestrate/[id] — Récupérer le statut d'une orchestration
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
    const { getOrchestration } = await import('@/lib/orchestration');
    const orchestration = await getOrchestration(id);

    if (!orchestration) {
      return NextResponse.json({ erreur: 'Orchestration introuvable' }, { status: 404 });
    }
    if (orchestration.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cette orchestration' }, { status: 403 });
    }

    return NextResponse.json({ orchestration });
  } catch (err) {
    console.error('[orchestrate/[id] GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer l\'orchestration' },
      { status: 500 },
    );
  }
}

// POST /api/orchestrate/[id] — Reprendre une orchestration échouée
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { getOrchestration, resumeOrchestration } = await import('@/lib/orchestration');
    const orchestration = await getOrchestration(id);

    if (!orchestration) {
      return NextResponse.json({ erreur: 'Orchestration introuvable' }, { status: 404 });
    }
    if (orchestration.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cette orchestration' }, { status: 403 });
    }

    const resumed = await resumeOrchestration(id);
    return NextResponse.json({ orchestration: resumed });
  } catch (err) {
    console.error('[orchestrate/[id] POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la reprise de l\'orchestration';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

// DELETE /api/orchestrate/[id] — Annuler une orchestration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { getOrchestration, cancelOrchestration } = await import('@/lib/orchestration');
    const orchestration = await getOrchestration(id);

    if (!orchestration) {
      return NextResponse.json({ erreur: 'Orchestration introuvable' }, { status: 404 });
    }
    if (orchestration.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cette orchestration' }, { status: 403 });
    }

    await cancelOrchestration(id);
    return NextResponse.json({ succès: true, message: 'Orchestration annulée avec succès' });
  } catch (err) {
    console.error('[orchestrate/[id] DELETE] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'annulation de l\'orchestration';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
