// ============================================================
// POST /api/plugins/[appId]/execute — Exécute une action proxy
// Production v2 — createApiHandler + Zod + rate limit + audit log
// ============================================================

import { z } from 'zod';
import { createApiHandler, ApiError } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

// ─── Zod schema ───
const ExecuteBodySchema = z.object({
  actionId: z.string().min(1),
  params: z.record(z.unknown()).optional().default({}),
});

export const POST = createApiHandler(
  async ({ auth, params, body }) => {
    const { appId } = params as { appId: string };
    const { actionId, params: actionParams } = body as z.infer<typeof ExecuteBodySchema>;

    // Lazy imports — isolation cold-start
    const { executeAction, getPlugin } = await import('@/lib/plugin-engine');

    const plugin = getPlugin(appId);
    if (!plugin) {
      throw ApiError.notFound(`Plugin \u00ab ${appId} \u00bb introuvable.`);
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

    // Audit log (fire-and-forget)
    const logExecution = async (data: Record<string, unknown>) => {
      try {
        const { prisma } = await import('@/lib/prisma');
        await prisma.pluginExecution.create({
          data: {
            pluginId: appId,
            userId: auth!.userId,
            inputs: JSON.stringify(actionParams || {}),
            output: JSON.stringify(data),
            durationMs: (data.durationMs as number) || 0,
            status: (data.status as string) || 'unknown',
            error: (data.error as string) || null,
          },
        });
      } catch { /* fire-and-forget */ }
    };

    const result = await executeAction(
      auth!.userId,
      { appId, actionId, params: actionParams },
      getStoredConnection,
      logExecution,
    );

    if (!result.success) {
      const status = result.status && result.status >= 400 && result.status < 500 ? 400 : 422;
      throw new ApiError(status, 'PLUGIN_EXECUTION_FAILED', result.error || 'Erreur d\'exécution');
    }

    return {
      data: result.data,
      durationMs: result.durationMs,
    };
  },
  {
    rateLimit: { limit: 60, windowMs: 60_000 },
    bodySchema: ExecuteBodySchema,
    envelope: false,
  },
);
