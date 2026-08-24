// ============================================================
// GET /api/plugins/connected — Liste les plugins connectés de l'utilisateur
// Production v2 — createApiHandler + rate limit + lazy import + défensif
// ============================================================

import { createApiHandler } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = createApiHandler(
  async ({ auth }) => {
    try {
      const { prisma } = await import('@/lib/prisma');
      const connections = await prisma.connectedIntegration.findMany({
        where: [
          { field: 'userId', op: '==', value: auth!.userId },
          { field: 'isActive', op: '==', value: true },
        ],
        select: ['id', 'appId', 'displayLabel', 'createdAt'],
      });
      return { connections };
    } catch (err) {
      // Défensif : ne jamais 500, retourner liste vide
      console.error('[plugins/connected] fetch failed:', err);
      return { connections: [] };
    }
  },
  {
    rateLimit: { limit: 120, windowMs: 60_000 },
    envelope: false,
  },
);
