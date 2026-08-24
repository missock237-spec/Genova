import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/models/chat — Acheminer et exécuter une complétion de chat
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.model || typeof body.model !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « model » est requis' },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { erreur: 'Le champ « messages » est requis et doit être un tableau non vide' },
        { status: 400 },
      );
    }

    const { routeAndExecute } = await import('@/lib/model-router');
    const result = await routeAndExecute({
      ...body,
      userId: auth.userId,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[models/chat POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'exécution du chat';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
