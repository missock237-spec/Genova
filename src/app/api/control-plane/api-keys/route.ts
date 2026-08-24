import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/control-plane/api-keys — Lister les clés API de l'utilisateur (masquées)
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { listApiKeys } = await import('@/lib/control-plane');
    const keys = await listApiKeys(auth.userId);

    // Masquer les clés partiellement
    const maskedKeys = keys.map((key: Record<string, unknown>) => ({
      ...key,
      key: key.key
        ? `${String(key.key).slice(0, 8)}${'•'.repeat(24)}`
        : undefined,
    }));

    return NextResponse.json({ clés: maskedKeys, total: maskedKeys.length });
  } catch (err) {
    console.error('[control-plane/api-keys GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les clés API' },
      { status: 500 },
    );
  }
}

// POST /api/control-plane/api-keys — Créer une nouvelle clé API
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { erreur: 'Le champ « name » est requis' },
        { status: 400 },
      );
    }

    const { createApiKey } = await import('@/lib/control-plane');
    const apiKey = await createApiKey({
      userId: auth.userId,
      name: body.name,
      permissions: body.permissions || [],
      expiresIn: body.expiresIn,
    });

    return NextResponse.json({ clé: apiKey }, { status: 201 });
  } catch (err) {
    console.error('[control-plane/api-keys POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la création de la clé API';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
