// ============================================================
// Workflows API - CRUD + Versioning initial
// SECURITE: applySecurity + ownership + rate limit Redis distribué
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import type { WorkflowCanvas } from '@/lib/workflow-engine';

export const dynamic = "force-dynamic";

// Type local de secours (même shape que WorkflowCanvas) si jamais
// l'import de type du moteur était résolu différemment par le builder.
type WorkflowCanvasLike = {
  blocks: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
};

// Imports paresseux pour éviter qu'un import cassé ne tue le handler GET
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}
async function getRateLimit() {
  const { rateLimit } = await import('@/lib/rate-limiter');
  return rateLimit;
}
async function getLogger() {
  const { createLogger } = await import('@/lib/logger');
  return createLogger('api-workflows');
}

function emptyWorkflowList(reason?: string, status = 200) {
  return NextResponse.json(
    {
      success: true,
      workflows: [],
      ...(reason ? { warning: reason } : {}),
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof value === 'object') {
    const rec = value as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof rec.toDate === 'function') return rec.toDate().getTime();
    if (typeof rec.seconds === 'number') return rec.seconds * 1000;
    if (typeof rec._seconds === 'number') return rec._seconds * 1000;
  }
  return 0;
}

// ============================================================
// GET — Liste des workflows de l'utilisateur
// Défensif : fallback sans orderBy si index composite manquant
// ============================================================
export async function GET(request: NextRequest) {
  // 1. Auth
  let auth;
  try {
    const result = await applySecurity(request, { requireAuth: true });
    if (result.error || !result.auth) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    auth = result.auth;
  } catch (err) {
    // En production mobile, un crash auth secondaire ne doit pas casser
    // l'écran Coordination avec un 500 opaque. On journalise et on renvoie
    // un état vide stable pour préserver l'UX, tout en évitant d'exposer
    // des données sans contexte utilisateur valide.
    console.error('[api-workflows GET] applySecurity crashed:', err);
    return emptyWorkflowList('Lecture workflows indisponible temporairement');
  }

  if (!auth?.userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // 2. Rate limit (fail-open)
  try {
    const rateLimit = await getRateLimit();
    const rl = await rateLimit(request, auth.userId);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
    }
  } catch (err) {
    // fail-open : ne pas bloquer l'utilisateur si Redis est down
    console.error('[api-workflows GET] rateLimit error (fail-open):', err);
  }

  // 3. Fetch workflows — défensif avec fallback
  const selectFields = ['id', 'name', 'description', 'trigger', 'status', 'updatedAt', 'createdAt', 'activeBranchId', 'currentVersionId'];

  try {
    const prisma = await getPrisma();
    const workflows = await prisma.workflow.findMany({
      where: [{ field: 'userId', op: '==', value: auth.userId }],
      orderBy: [{ field: 'updatedAt', direction: 'desc' }],
      select: selectFields,
    });
    return NextResponse.json(
      { success: true, workflows },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[api-workflows GET] Firestore query failed:', errMsg);

    // Détecter erreur d'index composite manquant
    if (errMsg.includes('FAILED_PRECONDITION') || errMsg.toLowerCase().includes('index')) {
      console.warn('[api-workflows GET] Missing composite index — falling back to query without orderBy');
      try {
        const prisma = await getPrisma();
        const workflows = await prisma.workflow.findMany({
          where: [{ field: 'userId', op: '==', value: auth.userId }],
          select: selectFields,
        });
        // Tri côté serveur (pas idéal mais fonctionnel)
        workflows.sort((a: any, b: any) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        return NextResponse.json(
          { success: true, workflows },
          { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
        );
      } catch (fallbackErr) {
        console.error('[api-workflows GET] Fallback query also failed:', fallbackErr);
      }
    }

    // Dernier recours : retourner vide plutôt que 500. L'écran Coordination
    // affiche ainsi l'état "Aucun workflow" au lieu d'une alerte serveur.
    return emptyWorkflowList('Lecture workflows indisponible temporairement');
  }
}

// ============================================================
// POST — Créer un workflow
// ============================================================
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Rate limit (fail-open)
  try {
    const rateLimit = await getRateLimit();
    const rl = await rateLimit(request, auth.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  } catch { /* fail-open */ }

  const log = await getLogger();
  const prisma = await getPrisma();

  try {
    const body = await request.json();
    const { name, description, trigger, template } = body;

    if (!name) return NextResponse.json({ error: 'name requis' }, { status: 400 });

    // Import paresseux du versioning (le type WorkflowCanvas est importé en haut)
    const { workflowVersioning } = await import('@/lib/workflow-versioning');

    let steps: WorkflowCanvas | WorkflowCanvasLike = { blocks: [], edges: [] };

    if (template) {
      const tmpl = await prisma.workflowTemplate.findUnique({ where: { id: template } });
      if (tmpl) {
        const parsed = JSON.parse(String(tmpl.steps || '{"blocks":[],"edges":[]}'));
        steps = {
          blocks: Array.isArray(parsed?.blocks) ? parsed.blocks : [],
          edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
        };
        await prisma.workflowTemplate.update({
          where: { id: template },
          data: { usageCount: (Number(tmpl.usageCount) || 0) + 1 },
        });
      }
    }

    const workflow = await prisma.workflow.create({
      data: {
        name, description: description || '',
        steps: JSON.stringify(steps),
        trigger: trigger || 'manual',
        status: 'draft',
        userId: auth.userId,
      },
    });

    await workflowVersioning.createWithInitialVersion(
      workflow.id as string, auth.userId, steps, 'Version initiale'
    );

    log.info('workflow_created_with_versioning', { workflowId: workflow.id });

    const fullWorkflow = await prisma.workflow.findUnique({ where: { id: workflow.id as string } });
    return NextResponse.json({ success: true, workflow: fullWorkflow });
  } catch (err) {
    log.error('workflow_create_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ============================================================
// PUT — Mettre à jour un workflow
// ============================================================
export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const rateLimit = await getRateLimit();
    const rl = await rateLimit(request, auth.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  } catch { /* fail-open */ }

  const prisma = await getPrisma();

  try {
    const body = await request.json();
    const { id, name, description, steps, trigger, status } = body;

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const workflow = await prisma.workflow.findFirst({
      where: [
        { field: 'id', op: '==', value: id },
        { field: 'userId', op: '==', value: auth.userId },
      ],
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    const updated = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(steps !== undefined && { steps: JSON.stringify(steps) }),
        ...(trigger !== undefined && { trigger }),
        ...(status !== undefined && { status }),
      },
    });

    if (body.test && steps) {
      const { workflowEngine } = await import('@/lib/workflow-engine');
      const result = await workflowEngine.execute(steps);
      return NextResponse.json({ success: true, workflow: updated, test: result });
    }

    return NextResponse.json({ success: true, workflow: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ============================================================
// DELETE — Supprimer un workflow
// ============================================================
export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const rateLimit = await getRateLimit();
    const rl = await rateLimit(request, auth.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  } catch { /* fail-open */ }

  const prisma = await getPrisma();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const workflow = await prisma.workflow.findFirst({
      where: [
        { field: 'id', op: '==', value: id },
        { field: 'userId', op: '==', value: auth.userId },
      ],
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow introuvable' }, { status: 404 });

    await prisma.workflow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
