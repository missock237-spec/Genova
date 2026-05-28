import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { requireAuth: true });
    if (error || !auth) return error || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const type = request.nextUrl.searchParams.get('type');
    const where: Record<string, unknown> = { userId: auth.userId };
    if (type) where.type = type;

    const conversations = await db.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { _count: { select: { messages: true } } },
    });

    return secureResponse(NextResponse.json(conversations), request);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
