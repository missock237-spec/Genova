import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });

    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    const updated = await db.guardrail.update({
      where: { id },
      data: { isActive: !guardrail.isActive },
    });

    await db.activityLog.create({
      data: {
        action: `Garde-fou ${updated.isActive ? 'activé' : 'désactivé'}`,
        details: JSON.stringify({ guardrailName: guardrail.name }),
        category: 'guardrail',
        userId: guardrail.userId,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
