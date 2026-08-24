// ============================================================
// POST /api/plugins/[appId]/connect — Connecter un plugin
// Stocke les identifiants chiffrés en Firestore (upsert)
// Production v2 — createApiHandler + Zod + rate limit + lazy imports
// ============================================================

import { z } from 'zod';
import { createApiHandler, ApiError } from '@/lib/api/handler';

export const dynamic = 'force-dynamic';

// ─── Zod schema ───
const ConnectBodySchema = z.object({
  credentials: z.object({
    apiKey: z.string().optional(),
    apiSecret: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  }).refine(
    (c) => c.apiKey || c.accessToken || c.username,
    { message: 'Au moins un identifiant requis (apiKey, accessToken ou username)' },
  ),
  displayLabel: z.string().max(200).optional(),
});

export const POST = createApiHandler(
  async ({ auth, params, body }) => {
    const { appId } = params as { appId: string };
    const b = body as z.infer<typeof ConnectBodySchema>;

    // Lazy imports pour isolation cold-start
    const { connectPlugin, getPlugin } = await import('@/lib/plugin-engine');

    // Vérifier que l'app existe dans le catalogue
    const plugin = getPlugin(appId);
    if (!plugin) {
      throw ApiError.notFound(`Plugin « ${appId} » introuvable dans le catalogue.`);
    }

    const result = await connectPlugin(auth!.userId, {
      appId,
      credentials: b.credentials,
      displayLabel: b.displayLabel,
    }, async (data: Record<string, unknown>) => {
      const { prisma } = await import('@/lib/prisma');

      // Upsert : chercher une connexion existante
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
          displayLabel: (data.displayLabel as string) || (data.appId as string),
          isActive: true,
          createdAt: data.createdAt as Date,
          updatedAt: data.updatedAt as Date,
        },
      });
      return created.id as string;
    });

    if (!result.success) {
      throw ApiError.badRequest(result.error || 'Échec de la connexion');
    }

    return { connectionId: result.connectionId };
  },
  {
    rateLimit: { limit: 20, windowMs: 60_000 },
    bodySchema: ConnectBodySchema,
    envelope: false,
  },
);
