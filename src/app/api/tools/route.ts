import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tools — Lister les outils disponibles
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return error || NextResponse.json({ erreur: 'Authentification requise' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const capability = searchParams.get('capability') || undefined;

    const { listTools } = await import('@/lib/tool-gateway');
    const tools = await listTools({ capability });

    return NextResponse.json({ tools, total: tools.length });
  } catch (err) {
    console.error('[tools GET] Erreur :', err);
    return NextResponse.json(
      { erreur: 'Impossible de récupérer la liste des outils' },
      { status: 500 },
    );
  }
}
