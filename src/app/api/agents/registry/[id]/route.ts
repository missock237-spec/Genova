import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents/registry/[id] — Récupérer un agent par ID
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
    const { getAgent } = await import('@/lib/agent-registry');
    const agent = await getAgent(id);

    if (!agent) {
      return NextResponse.json({ erreur: 'Agent introuvable' }, { status: 404 });
    }
    if (agent.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cet agent' }, { status: 403 });
    }

    return NextResponse.json({ agent });
  } catch (err) {
    console.error('[agents/registry/[id] GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer l\'agent' },
      { status: 500 },
    );
  }
}

// PUT /api/agents/registry/[id] — Mettre à jour un agent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { getAgent, updateAgent } = await import('@/lib/agent-registry');
    const existing = await getAgent(id);

    if (!existing) {
      return NextResponse.json({ erreur: 'Agent introuvable' }, { status: 404 });
    }
    if (existing.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cet agent' }, { status: 403 });
    }

    const body = await request.json();
    const updated = await updateAgent(id, body);

    return NextResponse.json({ agent: updated });
  } catch (err) {
    console.error('[agents/registry/[id] PUT] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour de l\'agent';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

// DELETE /api/agents/registry/[id] — Désactiver un agent (suppression logique)
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
    const { getAgent, deactivateAgent } = await import('@/lib/agent-registry');
    const existing = await getAgent(id);

    if (!existing) {
      return NextResponse.json({ erreur: 'Agent introuvable' }, { status: 404 });
    }
    if (existing.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cet agent' }, { status: 403 });
    }

    await deactivateAgent(id);

    return NextResponse.json({ succès: true, message: 'Agent désactivé avec succès' });
  } catch (err) {
    console.error('[agents/registry/[id] DELETE] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la désactivation de l\'agent';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
