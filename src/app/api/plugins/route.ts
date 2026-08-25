// ============================================================
// GET /api/plugins — Catalogue, SDK, plugins utilisateur, scaffold
// POST /api/plugins — Créer / exécuter / publier (SDK communautaire)
//
// Production v2 — createApiHandler + Zod + rate limiting + lazy imports
// ============================================================

import { z } from 'zod';
import { createApiHandler, ApiError } from '@/lib/api/handler';

// ─── Schemas de validation ───
const CatalogQuerySchema = z.object({
  scope: z.enum(['catalog', 'sdk', 'mine', 'scaffold']).optional().default('catalog'),
  category: z.string().optional(),
  q: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
});

const CreatePluginBodySchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().optional(),
  description: z.string().max(2000).optional(),
  type: z.string().optional(),
  icon: z.string().optional(),
  category: z.string().optional(),
  schema: z.record(z.unknown()).optional(),
  permissions: z.array(z.string()).optional(),
  hooks: z.record(z.unknown()).optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
});

const ExecutePluginBodySchema = z.object({
  pluginId: z.string().min(1),
  inputs: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  workflowId: z.string().optional(),
});

const PublishPluginBodySchema = z.object({
  pluginId: z.string().min(1),
});

// ─── GET ───
// Le catalogue (scope=catalog/sdk/scaffold) est une donnée PUBLIQUE :
// requireAuth: false les rend accessibles sans session (couche 2).
// Seul le scope 'mine' (plugins utilisateur) exige une authentification,
// vérifiée explicitement dans le handler.
export const GET = createApiHandler(
  async ({ auth, query }) => {
    const { scope, category, q, type, name } = query as z.infer<typeof CatalogQuerySchema>;

    switch (scope) {
      case 'catalog': {
        // Lazy import pour éviter le cold-start cascade
        const { listCatalog, PLUGIN_CATEGORIES, getTotalPluginCount } = await import('@/lib/plugin-engine');
        const plugins = listCatalog(category, q);
        return {
          total: getTotalPluginCount(),
          categories: PLUGIN_CATEGORIES,
          plugins,
        };
      }

      case 'sdk': {
        const { pluginSDK } = await import('@/lib/plugin-sdk');
        const plugins = await pluginSDK.getPlugins({ type, category });
        return { plugins };
      }

      case 'mine': {
        // Endpoint privé : exige une session valide.
        if (!auth?.userId) {
          throw ApiError.unauthorized('Authentification requise');
        }
        const { prisma } = await import('@/lib/prisma');
        const plugins = await prisma.plugin.findMany({
          where: [{ field: 'authorId', op: '==', value: auth.userId }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
        });
        return { plugins };
      }

      case 'scaffold': {
        const { pluginSDK } = await import('@/lib/plugin-sdk');
        const scaffold = pluginSDK.generateScaffold(name || 'MonPlugin', 'block');
        return { scaffold };
      }
    }
  },
  {
    requireAuth: false,
    rateLimit: { limit: 120, windowMs: 60_000 },
    querySchema: CatalogQuerySchema,
    envelope: false, // rétrocompatibilité frontend
  },
);

// ─── POST ───
// Les actions (create/execute/publish) restent AUTHENTIFIÉES.
// createApiHandler garde requireAuth: true (défaut) → couche 1 ET couche 2
// exigent une session/api key/bearer validée.
export const POST = createApiHandler(
  async ({ auth, body, query }) => {
    const action = (query.action as string) || 'create';
    const { pluginSDK } = await import('@/lib/plugin-sdk');

    switch (action) {
      case 'create': {
        const b = body as z.infer<typeof CreatePluginBodySchema>;
        const plugin = await pluginSDK.createPlugin({
          name: b.name,
          version: b.version,
          description: b.description,
          type: b.type,
          icon: b.icon,
          category: b.category,
          authorId: auth!.userId,
          schema: b.schema,
          permissions: b.permissions,
          hooks: b.hooks as any,
          sourceUrl: b.sourceUrl,
        });
        return { plugin } as any;
      }

      case 'execute': {
        const b = body as z.infer<typeof ExecutePluginBodySchema>;
        const result = await pluginSDK.executePlugin(b.pluginId, {
          inputs: b.inputs,
          config: b.config || {},
          context: b.context || {},
          userId: auth!.userId,
          workflowId: b.workflowId,
        });
        return { result };
      }

      case 'publish': {
        const b = body as z.infer<typeof PublishPluginBodySchema>;
        const plugin = await pluginSDK.publishPlugin(b.pluginId, auth!.userId);
        return { plugin } as any;
      }

      default:
        throw ApiError.badRequest('Action inconnue. Utilisez: create, execute, publish');
    }
  },
  {
    rateLimit: { limit: 60, windowMs: 60_000 },
    envelope: false,
  },
);
