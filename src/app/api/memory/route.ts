import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/memory — Rappeler des mémoires
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const query = searchParams.get('query') || undefined;
    const agentId = searchParams.get('agentId') || undefined;
    const sessionId = searchParams.get('sessionId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20;

    // Import direct — evite le barrel @/lib/memory qui pose probleme sur Vercel
    const { recall } = await import('@/lib/memory-system/manager');
    const memories = await recall({
      userId: auth.userId,
      type,
      query,
      agentId,
      sessionId,
      limit,
    });

    return NextResponse.json({ memories, total: memories.length });
  } catch (err) {
    console.error('[memory GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les mémoires' },
      { status: 500 },
    );
  }
}

// POST /api/memory — Stocker une mémoire
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
    if (!body.key || typeof body.key !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « key » est requis' },
        { status: 400 },
      );
    }
    if (body.value === undefined || body.value === null) {
      return NextResponse.json(
        { erreur: 'Le champ « value » est requis' },
        { status: 400 },
      );
    }

    // Import direct — evite le barrel @/lib/memory qui pose probleme sur Vercel
    const { remember } = await import('@/lib/memory-system/manager');
    const memoryId = await remember({
      userId: auth.userId,
      type: body.type,
      key: body.key,
      value: body.value,
      agentId: body.agentId,
      sessionId: body.sessionId,
      metadata: body.metadata,
      expiresAt: body.expiresAt,
    });

    return NextResponse.json({ memoryId }, { status: 201 });
  } catch (err) {
    console.error('[memory POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors du stockage de la mémoire';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}

// DELETE /api/memory — Oublier des mémoires
export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { erreur: 'Le paramètre de requête « type » est requis' },
        { status: 400 },
      );
    }

    // Import direct — evite le barrel @/lib/memory qui pose probleme sur Vercel
    const { forget } = await import('@/lib/memory-system/manager');
    const deleted = await forget(auth.userId, type);

    return NextResponse.json({ succès: true, supprimées: deleted });
  } catch (err) {
    console.error('[memory DELETE] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la suppression des mémoires';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
