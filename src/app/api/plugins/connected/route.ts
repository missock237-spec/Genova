// ============================================================
// GET /api/plugins/connected — Liste les plugins connectés de l'utilisateur
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { prisma } = await import('@/lib/prisma');
    const connections = await prisma.connectedIntegration.findMany({
      where: [{ field: 'userId', op: '==', value: auth!.userId }, { field: 'isActive', op: '==', value: true }],
      select: ['id', 'appId', 'displayLabel', 'createdAt'],
    });
    return NextResponse.json({ success: true, connections });
  } catch (err) {
    console.error('[plugins/connected] fetch failed:', err);
    return NextResponse.json({ success: true, connections: [] });
  }
}
