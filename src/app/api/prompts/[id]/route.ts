// ============================================================
// Gen3ia — Place de Prompts : détail, édition, suppression
// ============================================================
//  GET    /api/prompts/[id]   — détail d'un prompt. Le CONTENU n'est
//                               révélé qu'aux utilisateurs éligibles :
//                                 - prompts gratuits publics (isFree)
//                                 - propriétaire du prompt
//                                 - admin / modérateur
//                               Les autres reçoivent la forme publique
//                               (toPublicPrompt, sans `content`).
//  PATCH  /api/prompts/[id]   — édition (propriétaire ou admin).
//  DELETE /api/prompts/[id]   — suppression (propriétaire ou admin).
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import {
  PROMPT_CATEGORIES,
  detectVariables,
  toPublicPrompt,
  type PromptCategory,
  type PromptStatus,
} from '@/lib/prompts';

export const dynamic = 'force-dynamic';
const log = createLogger('prompts');

async function paramId(ctx: { params?: RouteParams }): Promise<string | null> {
  try {
    const params = await ctx.params;
    const id = params?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function isEligible(
  prompt: Record<string, unknown>,
  userId: string | undefined,
  role: string | undefined,
): boolean {
  if (!userId) return false;
  if (prompt.userId === userId) return true;
  return role === 'admin' || role === 'moderator';
}

// ============================================================
// GET /api/prompts/[id]
// ============================================================
export const GET = withAuth(async (
  _request: NextRequest,
  ctx: { params?: RouteParams },
  auth,
) => {
  try {
    const id = await paramId(ctx);
    if (!id) return NextResponse.json({ error: 'ID de prompt invalide' }, { status: 400 });

    const prompt = (await db.prompt.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (!prompt) return NextResponse.json({ error: 'Prompt introuvable' }, { status: 404 });

    // Un brouillon / dépublié n'est lisible que par son propriétaire ou un admin.
    const isPublicDoc =
      prompt.status === 'published' && prompt.isActive !== false;
    const eligible = isEligible(prompt, auth.userId, auth.role);
    if (!isPublicDoc && !eligible) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 404 });
    }

    const reveal = eligible || prompt.isFree === true;
    return NextResponse.json({ success: true, data: toPublicPrompt(prompt, !!reveal) });
  } catch (error) {
    log.error('prompts_detail_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}, { requireAuth: false });

// ============================================================
// PATCH /api/prompts/[id]
// ============================================================
export const PATCH = withAuth(async (
  request: NextRequest,
  ctx: { params?: RouteParams },
  auth,
) => {
  try {
    const id = await paramId(ctx);
    if (!id) return NextResponse.json({ error: 'ID de prompt invalide' }, { status: 400 });

    const prompt = (await db.prompt.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (!prompt) return NextResponse.json({ error: 'Prompt introuvable' }, { status: 404 });
    if (prompt.userId !== auth.userId && auth.role !== 'admin' && auth.role !== 'moderator') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    if (typeof b.name === 'string' && b.name.trim().length >= 3) data.name = b.name.trim();
    if (typeof b.description === 'string') data.description = b.description.trim();
    if (typeof b.content === 'string' && b.content.trim()) {
      data.content = b.content.trim();
      data.variables = detectVariables(b.content.trim());
    }
    if (typeof b.category === 'string' && (PROMPT_CATEGORIES as readonly string[]).includes(b.category)) {
      data.category = b.category as PromptCategory;
    }
    if (Array.isArray(b.tags)) {
      data.tags = b.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 10);
    }
    if (typeof b.price === 'number') data.price = Math.max(0, b.price);
    if (typeof b.isFree === 'boolean') data.isFree = b.isFree;
    if (b.status === 'published' || b.status === 'draft' || b.status === 'deprecated') {
      data.status = b.status as PromptStatus;
    }
    if (typeof b.featured === 'boolean' && (auth.role === 'admin' || auth.role === 'moderator')) {
      data.featured = b.featured; // réservé aux modérateurs
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    const updated = (await db.prompt.update({ where: { id }, data })) as Record<string, unknown>;
    log.info('prompts_updated', { id });
    return NextResponse.json({ success: true, data: toPublicPrompt(updated, true) });
  } catch (error) {
    log.error('prompts_update_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de mise à jour' }, { status: 500 });
  }
}, { requireAuth: true });

// ============================================================
// DELETE /api/prompts/[id]
// ============================================================
export const DELETE = withAuth(async (
  _request: NextRequest,
  ctx: { params?: RouteParams },
  auth,
) => {
  try {
    const id = await paramId(ctx);
    if (!id) return NextResponse.json({ error: 'ID de prompt invalide' }, { status: 400 });

    const prompt = (await db.prompt.findUnique({ where: { id } })) as Record<string, unknown> | null;
    if (!prompt) return NextResponse.json({ error: 'Prompt introuvable' }, { status: 404 });
    if (prompt.userId !== auth.userId && auth.role !== 'admin' && auth.role !== 'moderator') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await db.prompt.delete({ where: { id } });
    log.info('prompts_deleted', { id });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('prompts_delete_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de suppression' }, { status: 500 });
  }
}, { requireAuth: true });
