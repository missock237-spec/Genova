// ============================================================
// POST /api/plugins/[appId]/disconnect — Déconnecte un plugin
// Production v2 — createApiHandler + rate limit + lazy imports
// ============================================================

import { createApiHandler, ApiError } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = createApiHandler(
  async ({ auth, params }) => {
    const { appId } = params as { appId: string };

    // Lazy imports
    const { disconnectPlugin, getPlugin } = await import('@/lib/plugin-engine');

    const plugin = getPlugin(appId);
    if (!plugin) {
      throw ApiError.notFound(`Plugin « ${appId} » introuvable.`);
    }

    const result = await disconnectPlugin(auth!.userId, appId, async (aid: string) => {
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
      throw ApiError.badRequest(result.error || 'Échec de la déconnexion');
    }

    return { disconnected: true };
  },
  {
    rateLimit: { limit: 20, windowMs: 60_000 },
    envelope: false,
  },
);
