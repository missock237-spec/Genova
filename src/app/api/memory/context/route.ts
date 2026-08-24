import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/memory/context — Obtenir le contexte complet d'un agent
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const sessionId = searchParams.get('sessionId') || undefined;

    if (!agentId) {
      return NextResponse.json(
        { erreur: 'Le paramètre de requête « agentId » est requis' },
        { status: 400 },
      );
    }

    const { getAgentContext } = await import('@/lib/memory');
    const context = await getAgentContext({
      userId: auth.userId,
      agentId,
      sessionId,
    });

    return NextResponse.json({ context });
  } catch (err) {
    console.error('[memory/context GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer le contexte de l\'agent' },
      { status: 500 },
    );
  }
}
