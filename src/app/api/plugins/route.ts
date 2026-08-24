// ============================================================
// GET /api/plugins — Catalogue + plugins communautaires
// POST /api/plugins — Créer / exécuter / publier (SDK communautaire)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { listCatalog, PLUGIN_CATEGORIES, getTotalPluginCount } from '@/lib/plugin-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'catalog';

    switch (scope) {
      case 'catalog': {
        // Nouveau catalogue de proxy plugins (Slack, GitHub, Notion, Stripe...)
        const category = url.searchParams.get('category') || undefined;
        const query = url.searchParams.get('q') || undefined;
        const plugins = listCatalog(category, query);
        return NextResponse.json({
          success: true,
          total: getTotalPluginCount(),
          categories: PLUGIN_CATEGORIES,
          plugins,
        });
      }

      case 'sdk': {
        // Plugins communautaires (SDK existant)
        const type = url.searchParams.get('type') || undefined;
        const category = url.searchParams.get('category') || undefined;
        const { pluginSDK } = await import('@/lib/plugin-sdk');
        const plugins = await pluginSDK.getPlugins({ type, category });
        return NextResponse.json({ success: true, plugins });
      }

      case 'mine': {
        // Plugins créés par l'utilisateur
        const { prisma } = await import('@/lib/prisma');
        const plugins = await prisma.plugin.findMany({
          where: [{ field: 'authorId', op: '==', value: auth!.userId }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }],
        });
        return NextResponse.json({ success: true, plugins });
      }

      case 'scaffold': {
        const name = url.searchParams.get('name') || 'MonPlugin';
        const type = url.searchParams.get('type') || 'block';
        const { pluginSDK } = await import('@/lib/plugin-sdk');
        const scaffold = pluginSDK.generateScaffold(name, type);
        return NextResponse.json({ success: true, scaffold });
      }

      default:
        return NextResponse.json({ error: 'Scope inconnu. Utilisez: catalog, sdk, mine, scaffold' }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/plugins GET] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create';
    const { pluginSDK } = await import('@/lib/plugin-sdk');

    switch (action) {
      case 'create': {
        const plugin = await pluginSDK.createPlugin({
          name: body.name, version: body.version, description: body.description,
          type: body.type, icon: body.icon, category: body.category,
          authorId: auth!.userId, schema: body.schema,
          permissions: body.permissions, hooks: body.hooks, sourceUrl: body.sourceUrl,
        });
        return NextResponse.json({ success: true, plugin }, { status: 201 });
      }

      case 'execute': {
        if (!body.pluginId || !body.inputs) {
          return NextResponse.json({ error: 'pluginId et inputs requis' }, { status: 400 });
        }
        const result = await pluginSDK.executePlugin(body.pluginId, {
          inputs: body.inputs, config: body.config || {},
          context: body.context || {}, userId: auth!.userId, workflowId: body.workflowId,
        });
        return NextResponse.json({ success: true, result });
      }

      case 'publish': {
        if (!body.pluginId) {
          return NextResponse.json({ error: 'pluginId requis' }, { status: 400 });
        }
        const plugin = await pluginSDK.publishPlugin(body.pluginId, auth!.userId);
        return NextResponse.json({ success: true, plugin });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue. Utilisez: create, execute, publish' }, { status: 400 });
    }
  } catch (err) {
    console.error('[api/plugins POST] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
