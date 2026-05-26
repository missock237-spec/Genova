import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const type = request.nextUrl.searchParams.get('type');

    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const where: Record<string, string> = { userId };
    if (type) where.type = type;

    const conversations = await db.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        _count: { select: { messages: true } },
        agent: { select: { name: true, type: true } },
      },
    });

    return NextResponse.json(conversations);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
