import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import type { SecurityContext } from '@/lib/security';
import { checkAgentLimit } from '@/lib/usage-limits';
import { sanitizeHtml, sanitizeJson, stripNullBytes, escapeForDb } from '@/lib/input-sanitizer';
import { rateLimit } from '@/lib/rate-limiter';

export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  let auth: SecurityContext | undefined;
  let secError: NextResponse | undefined;

  try {
    const result = await applySecurity(request, { requireAuth: true });
    auth = result.auth;
    secError = result.error;
  } catch (err) {
    console.error('[agents/GET] applySecurity threw:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Erreur d\'authentification' }, { status: 401 });
  }
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Rate limit distribué (Redis) — fail-open
  try {
    const rl = await rateLimit(request, auth.userId);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });
  } catch {
    // fail-open — ne pas bloquer sur une erreur de rate limiting
  }

  // Requêtes Firestore avec retry individuel
  // Chaque requête est indépendante — une failure sur permissions/tasks
  // ne doit pas empêcher le retour des agents.
  const uid = auth.userId;

  // 1. Agents (requête principale) — SANS orderBy pour éviter le besoin
  //    d'index composite Firestore. Tri fait en mémoire.
  let agents: Record<string, unknown>[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      agents = await db.agent.findMany({
        where: [{ field: 'userId', op: '==', value: uid }],
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agents/GET] agents query attempt ${attempt}/3:`, msg);
      // Détecter l'erreur d'index manquant Firestore
      if (msg.includes('FAILED_PRECONDITION') || msg.includes('index')) {
        console.error('[agents/GET] ⚠ Missing Firestore composite index! Create index on: agents (userId ASC, createdAt DESC)');
        break; // Ne pas retry — l'index manquant est un problème permanent
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }

  // 2. Permissions (non-bloquant — échec silencieux)
  let permissions: Record<string, unknown>[] = [];
  try {
    permissions = await db.agentPermission.findMany({
      where: [{ field: 'userId', op: '==', value: uid }],
    });
  } catch (err) {
    console.warn('[agents/GET] permissions query failed (non-blocking):', err instanceof Error ? err.message : err);
  }

  // 3. Tasks count (non-bloquant — échec silencieux)
  let tasks: Record<string, unknown>[] = [];
  try {
    tasks = await db.task.findMany({
      where: [{ field: 'userId', op: '==', value: uid }],
    });
  } catch (err) {
    console.warn('[agents/GET] tasks query failed (non-blocking):', err instanceof Error ? err.message : err);
  }

  // Tri en mémoire par createdAt desc (évite le besoin d'index composite)
  agents.sort((a, b) => {
    const dateA = (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
    const dateB = (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
    return dateB - dateA;
  });

  // Construction de la réponse enrichie
  try {
    const byAgentPerms = permissions.reduce<Record<string, unknown[]>>((acc, p) => {
      const agentId = String((p as Record<string, unknown>).agentId || '');
      if (!acc[agentId]) acc[agentId] = [];
      acc[agentId].push({
        permission: (p as Record<string, unknown>).permission,
        granted: (p as Record<string, unknown>).granted,
        requiresApproval: (p as Record<string, unknown>).requiresApproval,
      });
      return acc;
    }, {});
    const taskCountByAgent = tasks.reduce<Record<string, number>>((acc, t) => {
      const agentId = String((t as Record<string, unknown>).agentId || '');
      acc[agentId] = (acc[agentId] || 0) + 1;
      return acc;
    }, {});

    const enriched = agents.map((agent) => {
      const id = String((agent as Record<string, unknown>).id);
      return {
        ...agent,
        _count: { tasks: taskCountByAgent[id] || 0 },
        permissions: byAgentPerms[id] || [],
      };
    });

    const res = NextResponse.json(enriched);
    return secureResponse(res, request);
  } catch (err) {
    console.error('[agents/GET] Error enriching agents:', err instanceof Error ? err.message : err);
    const res = NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Rate limit plus strict pour la création (abuse possible)
  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  try {
    const body = await request.json();
    let { name, description, config, avatar } = body;
    const { type } = body;

    if (!name || !type) {
      const res = NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate agent type
    const VALID_TYPES = ['sales', 'support', 'marketing', 'research', 'rh', 'accounting', 'custom', 'social_media', 'browser'];
    if (!VALID_TYPES.includes(type)) {
      const res = NextResponse.json(
        { error: `Invalid type. Allowed: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input sanitization — strip HTML, null bytes, and NoSQL injection patterns
    name = sanitizeHtml(stripNullBytes(escapeForDb(name)));
    description = description ? sanitizeHtml(stripNullBytes(escapeForDb(description))) : '';

    // Input length validation (after sanitization)
    if (name.length > 100) {
      const res = NextResponse.json(
        { error: 'Name must be at most 100 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (description && description.length > 1000) {
      const res = NextResponse.json(
        { error: 'Description must be at most 1000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate config JSON structure
    if (config) {
      const configValidation = sanitizeJson(config);
      if (!configValidation.valid) {
        const res = NextResponse.json(
          { error: `Invalid config: ${configValidation.error}` },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
      config = configValidation.data;
    }

    // Sanitize avatar URL if provided
    if (avatar && typeof avatar === 'string') {
      avatar = stripNullBytes(avatar);
    }

    // Check total agent limit for the user's plan (avec retry cold start)
    let user: Record<string, unknown> | null = null;
    let agentLimitCheck = { allowed: true, current: 0, limit: 0 };
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        user = await db.user.findUnique({
          where: { id: auth.userId },
          select: ['plan'],
        });
        const plan = (user?.plan as string) || 'free';
        agentLimitCheck = await checkAgentLimit(auth.userId, plan);
        break;
      } catch (err) {
        console.error(`[agents/POST] Plan/limit check attempt ${attempt}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
        else throw err; // re-throw on final attempt
      }
    }

    const plan = (user?.plan as string) || 'free';

    if (!agentLimitCheck.allowed) {
      const upgradeMessage = plan === 'free'
        ? ' Upgrade to Pro for up to 20 agents.'
        : ' You have reached the maximum agents for your plan.';

      const res = NextResponse.json(
        {
          error: `Agent limit reached (${agentLimitCheck.current}/${agentLimitCheck.limit}).${upgradeMessage}`,
          code: 'AGENT_LIMIT_REACHED',
          current: agentLimitCheck.current,
          limit: agentLimitCheck.limit,
        },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    // Create agent avec retry (cold start Vercel)
    let agent: Record<string, unknown> | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        agent = await db.agent.create({
          data: {
            name,
            type,
            description: description || '',
            config: config ? JSON.stringify(config) : '{}',
            avatar: avatar || null,
            userId: auth.userId,
          },
        });
        break;
      } catch (err) {
        console.error(`[agents/POST] db.agent.create attempt ${attempt}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
        else throw err;
      }
    }

    // Create default permissions for the agent (avec retry)
    const defaultPermissions = [
      { permission: 'browse_web', granted: false, requiresApproval: true },
      { permission: 'social_post', granted: false, requiresApproval: true },
      { permission: 'social_youtube', granted: false, requiresApproval: true },
      { permission: 'social_facebook', granted: false, requiresApproval: true },
      { permission: 'social_instagram', granted: false, requiresApproval: true },
      { permission: 'social_tiktok', granted: false, requiresApproval: true },
      { permission: 'social_linkedin', granted: false, requiresApproval: true },
      { permission: 'use_api', granted: false, requiresApproval: true },
      { permission: 'use_cpu', granted: false, requiresApproval: true },
      { permission: 'use_mvp', granted: false, requiresApproval: true },
    ];

    const agentId = (agent!).id as string;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await db.agentPermission.createMany({
          data: defaultPermissions.map((p) => ({
            agentId,
            permission: p.permission,
            granted: p.granted,
            requiresApproval: p.requiresApproval,
            userId: auth.userId,
          })),
        });
        break;
      } catch (err) {
        console.error(`[agents/POST] createMany permissions attempt ${attempt}/3 failed:`, err instanceof Error ? err.message : err);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
        else throw err;
      }
    }

    // Audit log (fire-and-forget avec retry léger)
    db.auditLog.create({
      data: {
        action: 'Agent Created',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId: auth.userId,
      },
    }).catch((err) => {
      console.error('[agents/POST] auditLog.create failed (non-blocking):', err instanceof Error ? err.message : err);
    });

    // Return agent with permissions (include:{permissions} calculé en mémoire)
    const agentRow = await db.agent.findUnique({
      where: { id: agentId },
    });
    const perms = await db.agentPermission.findMany({
      where: [{ field: 'agentId', op: '==', value: agentId }],
    });
    const agentWithPerms = { ...agentRow, permissions: perms };

    const res = NextResponse.json(agentWithPerms, { status: 201 });
    return secureResponse(res, request);
  } catch (err) {
    console.error('[agents/POST] Failed to create agent:', err instanceof Error ? err.message : err);
    const res = NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
