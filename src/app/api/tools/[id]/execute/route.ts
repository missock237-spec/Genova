import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/tools/[id]/execute — Exécuter un outil
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
    const body = await request.json();

    if (!body.input || typeof body.input !== 'object') {
      return NextResponse.json(
        { erreur: 'Le champ « input » est requis et doit être un objet' },
        { status: 400 },
      );
    }

    const { executeTool } = await import('@/lib/tool-gateway');
    const result = await executeTool(id, body.input, {
      userId: auth.userId,
      role: auth.role,
    });

    return NextResponse.json({ résultat: result });
  } catch (err) {
    console.error('[tools/[id]/execute POST] Erreur :', err);
    const message = err instanceof Error ? err.message : 'Erreur lors de l\'exécution de l\'outil';
    return NextResponse.json({ erreur: message }, { status: 500 });
  }
}
