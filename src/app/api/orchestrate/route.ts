import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { enforceSecurity, AgentSecurityBlockError } from '@/lib/security/agent-security-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/orchestrate — Démarrer une orchestration
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.objective || typeof body.objective !== 'string' || body.objective.trim().length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « objective » est requis et doit être une chaîne non vide' },
        { status: 400 },
      );
    }

    // FAIL-CLOSED: valider l'objectif d'orchestration
    try {
      await enforceSecurity(body.objective, {
        agentId: body.agentIds?.[0] || 'orchestration',
        userId: auth.userId,
        allowedTools: [],
        source: 'api_orchestrate',
      });
    } catch (secErr) {
      if (secErr instanceof AgentSecurityBlockError) {
        return NextResponse.json({ erreur: `Sécurité: ${secErr.message}` }, { status: 403 });
      }
      throw secErr;
    }

    const { orchestrate } = await import('@/lib/orchestration');
    const result = await orchestrate({
      userId: auth.userId,
      objective: body.objective,
      input: body.input,
      model: body.model,
      tools: body.tools,
      agentIds: body.agentIds,
      budget: body.budget,
    });

    return NextResponse.json({ orchestration: result }, { status: 201 });
  } catch (err) {
    console.error('[orchestrate POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors du démarrage de l\'orchestration';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

// GET /api/orchestrate — Lister les orchestrations de l'utilisateur courant
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const { listOrchestrations } = await import('@/lib/orchestration');
    const orchestrations = await listOrchestrations(auth.userId, { status, limit });

    return NextResponse.json({ orchestrations, total: orchestrations.length });
  } catch (err) {
    console.error('[orchestrate GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les orchestrations' },
      { status: 500 },
    );
  }
}
