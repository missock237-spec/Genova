// ============================================================
// POST /api/plugins/[appId]/disconnect — Déconnecte un plugin
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { disconnectPlugin } from '@/lib/plugin-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { appId } = await params;

  try {
    const result = await disconnectPlugin(auth!.userId, appId, async (aid) => {
      const { prisma } = await import('@/lib/prisma');
      const existing = await prisma.connectedIntegration.findFirst({
        where: [
          { field: 'userId', op: '==', value: auth!.userId },
          { field: 'appId', op: '==', value: aid },
        ],
      });
      if (existing?.id) {
        await prisma.connectedIntegration.update({
          where: { id: existing.id as string },
          data: { isActive: false, updatedAt: new Date() },
        });
      }
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[plugins/disconnect] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
