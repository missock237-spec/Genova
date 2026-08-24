import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tools/permissions — Lister les permissions d'outils de l'utilisateur courant
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { listToolPermissions } = await import('@/lib/tool-gateway');
    const permissions = await listToolPermissions(auth.userId);

    return NextResponse.json({ permissions });
  } catch (err) {
    console.error('[tools/permissions GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les permissions d\'outils' },
      { status: 500 },
    );
  }
}

// POST /api/tools/permissions — Accorder une permission d'outil (admin uniquement)
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json(
      { erreur: 'Accès réservé aux administrateurs' },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();

    if (!body.userId || typeof body.userId !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « userId » est requis' },
        { status: 400 },
      );
    }
    if (!body.toolId || typeof body.toolId !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « toolId » est requis' },
        { status: 400 },
      );
    }

    const { grantToolPermission } = await import('@/lib/tool-gateway');
    const permission = await grantToolPermission({
      userId: body.userId,
      toolId: body.toolId,
      granted: body.granted !== false,
      requiresApproval: body.requiresApproval || false,
    });

    return NextResponse.json({ permission }, { status: 201 });
  } catch (err) {
    console.error('[tools/permissions POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'octroi de la permission';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
