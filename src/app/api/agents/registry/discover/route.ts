import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents/registry/discover — Découvrir des agents par capacité/modèle/outil
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const capability = searchParams.get('capability') || undefined;
    const model = searchParams.get('model') || undefined;
    const tool = searchParams.get('tool') || undefined;

    if (!capability && !model && !tool) {
      return NextResponse.json(
        { erreur: 'Au moins un filtre est requis : capability, model ou tool' },
        { status: 400 },
      );
    }

    const { discoverAgents } = await import('@/lib/agent-registry');
    const agents = await discoverAgents({ capability, model, tool });

    return NextResponse.json({ agents, total: agents.length });
  } catch (err) {
    console.error('[agents/registry/discover GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de découvrir les agents' },
      { status: 500 },
    );
  }
}
