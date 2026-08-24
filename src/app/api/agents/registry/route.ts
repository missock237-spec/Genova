import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents/registry — Lister les agents de l'utilisateur
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      capability: searchParams.get('capability') || undefined,
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0,
    };

    const { listAgents } = await import('@/lib/agent-registry');
    const agents = await listAgents(auth.userId, filters);

    return NextResponse.json({ agents, total: agents.length });
  } catch (err) {
    console.error('[agents/registry GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer la liste des agents' },
      { status: 500 },
    );
  }
}

// POST /api/agents/registry — Enregistrer un nouvel agent
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « name » est requis et doit être une chaîne non vide' },
        { status: 400 },
      );
    }
    if (!body.instructions || typeof body.instructions !== 'string' || body.instructions.trim().length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « instructions » est requis et doit être une chaîne non vide' },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.capabilities) || body.capabilities.length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « capabilities » est requis et doit être un tableau non vide' },
        { status: 400 },
      );
    }

    const { registerAgent } = await import('@/lib/agent-registry');
    const agent = await registerAgent({
      ...body,
      userId: auth.userId,
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (err) {
    console.error('[agents/registry POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement de l\'agent';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
