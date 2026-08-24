// ============================================================
// POST /api/plugins/[appId]/execute — Exécute une action proxy
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { executeAction } from '@/lib/plugin-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ appId: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { appId } = await params;

  try {
    const body = await request.json();
    if (!body.actionId) {
      return NextResponse.json({ error: 'actionId requis' }, { status: 400 });
    }

    // Récupérer la connexion chiffrée depuis Firestore
    const getStoredConnection = async (aid: string) => {
      const { prisma } = await import('@/lib/prisma');
      const conn = await prisma.connectedIntegration.findFirst({
        where: [
          { field: 'userId', op: '==', value: auth!.userId },
          { field: 'appId', op: '==', value: aid },
          { field: 'isActive', op: '==', value: true },
        ],
      });
      return conn ? (conn as Record<string, unknown>) as any : null;
    };

    // Audit log
    const logExecution = async (data: Record<string, unknown>) => {
      try {
        const { prisma } = await import('@/lib/prisma');
        await prisma.pluginExecution.create({
          data: {
            pluginId: appId,
            userId: auth!.userId,
            inputs: JSON.stringify(body.params || {}),
            output: JSON.stringify(data),
            durationMs: data.durationMs as number || 0,
            status: data.status as string || 'unknown',
            error: (data.error as string) || null,
          },
        });
      } catch { /* fire-and-forget */ }
    };

    const result = await executeAction(
      auth!.userId,
      { appId, actionId: body.actionId, params: body.params || {} },
      getStoredConnection,
      logExecution,
    );

    if (!result.success) {
      const status = result.status && result.status >= 400 && result.status < 500 ? 400 : 422;
      return NextResponse.json({ success: false, error: result.error, durationMs: result.durationMs }, { status });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('[plugins/execute] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
