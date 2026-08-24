import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents/registry/[id]/versions — Lister les versions d'un agent
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
    const { getAgent, listAgentVersions } = await import('@/lib/agent-registry');
    const agent = await getAgent(id);

    if (!agent) {
      return NextResponse.json({ erreur: 'Agent introuvable' }, { status: 404 });
    }
    if (agent.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cet agent' }, { status: 403 });
    }

    const versions = await listAgentVersions(id);
    return NextResponse.json({ versions, total: versions.length });
  } catch (err) {
    console.error('[agents/registry/[id]/versions GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les versions de l\'agent' },
      { status: 500 },
    );
  }
}

// POST /api/agents/registry/[id]/versions — Publier une nouvelle version
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
    const { getAgent, publishAgentVersion } = await import('@/lib/agent-registry');
    const agent = await getAgent(id);

    if (!agent) {
      return NextResponse.json({ erreur: 'Agent introuvable' }, { status: 404 });
    }
    if (agent.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json({ erreur: 'Accès non autorisé à cet agent' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.changelog || typeof body.changelog !== 'string' || body.changelog.trim().length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « changelog » est requis pour publier une nouvelle version' },
        { status: 400 },
      );
    }

    const version = await publishAgentVersion(id, {
      changelog: body.changelog,
      data: body.data,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    console.error('[agents/registry/[id]/versions POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la publication de la version';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
