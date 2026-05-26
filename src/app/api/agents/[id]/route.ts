import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await db.agent.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const agent = await db.agent.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.type && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.config && { config: JSON.stringify(body.config) }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
        ...(body.status && { status: body.status }),
      },
    });

    return NextResponse.json(agent);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await db.agent.findUnique({ where: { id } });

    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    await db.agent.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Agent supprimé',
        details: JSON.stringify({ agentName: agent.name }),
        category: 'agent',
        userId: agent.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
