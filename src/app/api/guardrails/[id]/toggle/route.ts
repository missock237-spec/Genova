import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });
    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, guardrail.userId, 'Garde-fou');
    if (ownershipError) return ownershipError;

    const updated = await db.guardrail.update({
      where: { id },
      data: { isActive: !guardrail.isActive },
    });

    await db.activityLog.create({
      data: { action: `Garde-fou ${updated.isActive ? 'activé' : 'désactivé'}`, details: JSON.stringify({ guardrailName: guardrail.name }), category: 'guardrail', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json(updated));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
