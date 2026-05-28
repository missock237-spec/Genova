import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });

    if (!guardrail) {
      return secureResponse(
        NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 }),
        request
      );
    }

    if (guardrail.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    // Use atomic conditional update to prevent race condition
    const newIsActive = !guardrail.isActive;
    const updateResult = await db.guardrail.updateMany({
      where: { id, isActive: guardrail.isActive },
      data: { isActive: newIsActive },
    });

    if (updateResult.count === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Le garde-fou a été modifié par une autre requête' }, { status: 409 }),
        request
      );
    }

    await db.activityLog.create({
      data: {
        action: `Garde-fou ${newIsActive ? 'activé' : 'désactivé'}`,
        details: JSON.stringify({ guardrailName: guardrail.name }),
        category: 'guardrail',
        userId: guardrail.userId,
      },
    });

    return secureResponse(NextResponse.json({ id: guardrail.id, isActive: newIsActive }), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
