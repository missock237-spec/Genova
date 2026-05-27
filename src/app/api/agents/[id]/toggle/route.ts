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
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, agent.userId, 'Agent');
    if (ownershipError) return ownershipError;

    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    const updated = await db.agent.update({
      where: { id },
      data: { status: newStatus },
    });

    await db.activityLog.create({
      data: {
        action: `Agent ${newStatus === 'active' ? 'activé' : 'désactivé'}`,
        details: JSON.stringify({ agentName: agent.name, status: newStatus }),
        category: 'agent',
        userId: auth!.userId,
      },
    });

    return secureResponse(request, NextResponse.json(updated));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
