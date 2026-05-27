import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const type = request.nextUrl.searchParams.get('type');
    const where: Record<string, string> = { userId: auth!.userId };
    if (type) where.type = type;

    const conversations = await db.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { _count: { select: { messages: true } }, agent: { select: { name: true, type: true } } },
    });

    return secureResponse(request, NextResponse.json(conversations));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
