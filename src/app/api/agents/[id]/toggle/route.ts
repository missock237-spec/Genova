import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await db.agent.findUnique({ where: { id } });

    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

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
        userId: agent.userId,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
