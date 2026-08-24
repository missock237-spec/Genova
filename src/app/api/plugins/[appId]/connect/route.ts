// ============================================================
// POST /api/plugins/[appId]/connect — Connecter un plugin (stocke les clés chiffrées)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { connectPlugin } from '@/lib/plugin-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { appId } = await params;

  try {
    const body = await request.json();
    if (!body.credentials) {
      return NextResponse.json({ error: 'credentials requis' }, { status: 400 });
    }

    const result = await connectPlugin(auth!.userId, { appId, ...body }, async (data) => {
      const { prisma } = await import('@/lib/prisma');
      // upsert : créer ou mettre à jour la connexion
      const existing = await prisma.connectedIntegration.findFirst({
        where: [
          { field: 'userId', op: '==', value: data.userId },
          { field: 'appId', op: '==', value: data.appId },
        ],
      });
      if (existing?.id) {
        await prisma.connectedIntegration.update({
          where: { id: existing.id as string },
          data: {
            encryptedCredentials: data.encryptedCredentials as string,
            iv: data.iv as string,
            displayLabel: data.displayLabel as string,
            isActive: true,
            updatedAt: data.updatedAt as Date,
          },
        });
        return existing.id as string;
      }
      const created = await prisma.connectedIntegration.create({
        data: {
          userId: data.userId as string,
          appId: data.appId as string,
          encryptedCredentials: data.encryptedCredentials as string,
          iv: data.iv as string,
          displayLabel: (data.displayLabel as string) || data.appId,
          isActive: true,
          createdAt: data.createdAt as Date,
          updatedAt: data.updatedAt as Date,
        },
      });
      return created.id as string;
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, connectionId: result.connectionId });
  } catch (err) {
    console.error('[plugins/connect] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
