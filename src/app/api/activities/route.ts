import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const activities = await db.activityLog.findMany({
      where: { userId: auth!.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return secureResponse(request, NextResponse.json(activities));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
