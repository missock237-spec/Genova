import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/verification/[executionId] — Résultats de vérification pour une exécution
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { executionId } = await params;
    const { getVerificationResults } = await import('@/lib/control-plane');
    const results = await getVerificationResults(executionId);

    if (!results) {
      return NextResponse.json(
        { erreur: 'Résultats de vérification introuvables pour cette exécution' },
        { status: 404 },
      );
    }

    // Vérifier que l'utilisateur a accès à cette exécution
    if (results.userId && results.userId !== auth.userId && auth.role !== 'admin') {
      return NextResponse.json(
        { erreur: 'Accès non autorisé à ces résultats de vérification' },
        { status: 403 },
      );
    }

    return NextResponse.json({ résultats: results });
  } catch (err) {
    console.error('[verification/[executionId] GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer les résultats de vérification' },
      { status: 500 },
    );
  }
}
