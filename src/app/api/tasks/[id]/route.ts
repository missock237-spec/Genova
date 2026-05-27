import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const { id } = await params;
    const task = await db.task.findUnique({
      where: { id },
      include: { agent: true, workflow: true, validations: { include: { guardrail: true } } },
    });

    if (!task) {
      return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, task.userId, 'Tâche');
    if (ownershipError) return ownershipError;

    return secureResponse(request, NextResponse.json(task));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
