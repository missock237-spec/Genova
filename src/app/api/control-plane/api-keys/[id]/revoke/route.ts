import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/control-plane/api-keys/[id]/revoke — Révoquer une clé API
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
    const { revokeApiKey } = await import('@/lib/control-plane');
    await revokeApiKey(id, auth.userId);

    return NextResponse.json({ succès: true, message: 'Clé API révoquée avec succès' });
  } catch (err) {
    console.error('[control-plane/api-keys/[id]/revoke POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de la révocation de la clé API';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
