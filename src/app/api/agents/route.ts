import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const agents = await db.agent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return NextResponse.json(agents);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, description, config, avatar, userId } = body;

    if (!name || !type || !userId) {
      return NextResponse.json({ error: 'Nom, type et userId requis' }, { status: 400 });
    }

    const agent = await db.agent.create({
      data: {
        name,
        type,
        description: description || '',
        config: config ? JSON.stringify(config) : '{}',
        avatar: avatar || null,
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Agent créé',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
