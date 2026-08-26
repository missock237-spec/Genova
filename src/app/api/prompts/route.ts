// ============================================================
// Gen3ia — Place de Prompts : API de listing et de création
// ============================================================
//  GET  /api/prompts          — parcours PUBLIC (seulement status=published)
//  POST /api/prompts          — création d'un prompt (auth requise).
//                              Brouillon (status=draft) non soumis au quota ;
//                              publication au-delà de la limite du plan refusée.
//
//  Sécurité :
//    - Le contenu (content) d'un prompt n'est JAMAIS renvoyé sur le parcours
//      de liste publique (toPublicPrompt révèle uniquement si éligible).
//    - Le quota de publication est plafonné par plan via PROMPT_PUBLISH_LIMITS.
//    - Rate limiting + RBAC via withAuth sur la création.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import type { FirestoreWhereOp, FirestoreOrderBy } from '@/lib/firebase/firestore';
import {
  PROMPT_CATEGORIES,
  detectVariables,
  slugifyPrompt,
  getPromptPublishLimit,
  toPublicPrompt,
  type PromptCategory,
  type PromptStatus,
} from '@/lib/prompts';

export const dynamic = 'force-dynamic';
const log = createLogger('prompts');

type PromptSort = 'newest' | 'popular' | 'rating' | 'featured';

// Champ Firestore utilisé pour chaque mode de tri (couplé avec le fallback mémoire).
const SORT_FIELD: Record<PromptSort, string> = {
  newest: 'createdAt',
  popular: 'installCount',
  rating: 'rating',
  featured: 'featured',
};

/** Parse un body POST de prompt + validations minimales. */
function parsePromptBody(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const categoryRaw = typeof body.category === 'string' ? body.category : '';
  const category = (PROMPT_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw as PromptCategory
    : ('copywriting' as PromptCategory);
  const tags = Array.isArray(body.tags)
    ? body.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 10)
    : [];
  const price = Math.max(0, Number(body.price) || 0);
  const isFree = typeof body.isFree === 'boolean' ? body.isFree : price === 0;
  const requestedStatus: PromptStatus =
    body.status === 'published' || body.status === 'deprecated' ? body.status : 'draft';

  return {
    name, description, content, category, tags, price, isFree, requestedStatus,
    errors: {
      name: name.length < 3 ? 'Nom requis (min 3 caractères)' : null,
      description: description.length < 10 ? 'Description requise (min 10 caractères)' : null,
      content: content.length < 5 ? 'Contenu du prompt requis' : null,
    },
  };
}

// ============================================================
// GET /api/prompts — parcours public
// ============================================================
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const category = sp.get('category');
    const search = sp.get('search');
    const author = sp.get('author');
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') || '20', 10)));
    const sort = (sp.get('sort') || 'newest') as PromptSort;
    const sortField = SORT_FIELD[sort] || 'createdAt';

    // Toujours filtrer sur published + actif — le contenu non publié reste masqué.
    const where: FirestoreWhereOp[] = [
      { field: 'status', op: '==', value: 'published' },
      { field: 'isActive', op: '==', value: true },
    ];
    if (category && (PROMPT_CATEGORIES as readonly string[]).includes(category)) {
      where.push({ field: 'category', op: '==', value: category });
    }
    if (author) where.push({ field: 'userId', op: '==', value: author });

    // Tri avec fallback en mémoire : on tente d'abord un orderBy Firestore,
    // si l'index composite requis n'est pas déployé (erreur index manquant)
    // on re-lit sans orderBy et on trie côté serveur (volume raisonnable).
    // [server-03] Plafond raisonnable pour la pagination mémoire
    const MAX_PROMPTS_LOAD = 500;
    let rows: Record<string, unknown>[] = [];
    try {
      rows = (await db.prompt.findMany({
        where,
        orderBy: [{ field: sortField, direction: 'desc' }] as FirestoreOrderBy[],
        take: MAX_PROMPTS_LOAD,
      })) as Record<string, unknown>[];
    } catch {
      log.warn('prompts_index_fallback', { sortField });
      rows = (await db.prompt.findMany({ where, take: MAX_PROMPTS_LOAD })) as Record<string, unknown>[];
      const dir = (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (Number(b[sortField]) || 0) - (Number(a[sortField]) || 0);
      rows.sort(dir);
    }

    // Recherche plein texte (nom / description / tags) en mémoire.
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const desc = String(p.description || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? p.tags.map(String).join(' ').toLowerCase() : '';
        return name.includes(q) || desc.includes(q) || tags.includes(q);
      });
    }

    // Modes de tri `featured` / `rating` : présence + décroissant en mémoire.
    if (sort === 'featured') {
      rows.sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0));
    } else if (sort === 'popular') {
      rows.sort((a, b) => Number(b.installCount || 0) - Number(a.installCount || 0));
    }

    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);
    const data = paged.map((p) => toPublicPrompt(p)); // sans content

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error('prompts_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement des prompts' }, { status: 500 });
  }
}

// ============================================================
// POST /api/prompts — création (auth requise)
// ============================================================
export const POST = withAuth(async (
  request: NextRequest,
  _ctx: { params?: RouteParams },
  auth,
) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
    }

    const { name, description, content, category, tags, price, isFree, requestedStatus, errors } =
      parsePromptBody(body as Record<string, unknown>);

    const firstError = Object.values(errors).find(Boolean);
    if (firstError) return NextResponse.json({ error: firstError }, { status: 400 });

    // Quota de publication : les brouillons ne sont jamais limités, seuls
    // les prompts PUBLIÉS comptent contre la limite du plan.
    let quotaOk = true;
    if (requestedStatus === 'published') {
      const user = await db.user.findUnique({ where: { id: auth.userId }, select: ['plan', 'role'] });
      const plan = ((user as { plan?: string } | null)?.plan) || 'free';
      const limit = getPromptPublishLimit(plan);
      // [server-02] count() au lieu de findMany pour vérifier le quota
      const publishedCount = await db.prompt.count({
        where: [
          { field: 'userId', op: '==', value: auth.userId },
          { field: 'status', op: '==', value: 'published' },
          { field: 'isActive', op: '==', value: true },
        ],
      }).catch(() => 0);
      if (publishedCount >= limit) {
        quotaOk = false;
        log.warn('prompts_publish_quota_exceeded', {
          userId: auth.userId, plan, limit, count: publishedCount,
        });
        return NextResponse.json({
          error: `Limite de publication atteinte (${limit}) pour le plan ${plan}. Résiliez ou passez à un plan supérieur.`,
        }, { status: 403 });
      }
    }

    const variables = detectVariables(content);
    const created = (await db.prompt.create({
      data: {
        userId: auth.userId,
        name,
        slug: slugifyPrompt(name),
        description,
        category,
        tags,
        content,
        variables,
        status: requestedStatus,
        isActive: true,
        isOfficial: false,
        price,
        isFree,
        rating: 0,
        reviewCount: 0,
        favoriteCount: 0,
        installCount: 0,
        featured: false,
      },
    })) as Record<string, unknown>;

    log.info('prompts_created', { id: created.id, name, status: requestedStatus });
    return NextResponse.json({ success: true, data: toPublicPrompt(created, true) }, { status: 201 });
  } catch (error) {
    log.error('prompts_create_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de création du prompt' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 15, windowMs: 60_000 },
});
