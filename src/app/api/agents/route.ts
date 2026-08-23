import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
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
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  // Rate limit distribué (Redis)
  const rl = await rateLimit(request, auth.userId);
  if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

  // Retry : résilience contre les cold starts Vercel (Firestore gRPC
  // channel non encore établi, timeout réseau, etc.)
  let agents: Record<string, unknown>[] = [];
  let permissions: Record<string, unknown>[] = [];
  let tasks: Record<string, unknown>[] = [];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      agents = await db.agent.findMany({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
      });

      // include:{ _count:{tasks}, permissions } -> calculé en mémoire via la façade
      const results = await Promise.all([
        db.agentPermission.findMany({ where: [{ field: 'userId', op: '==', value: auth.userId }] }),
        db.task.findMany({ where: [{ field: 'userId', op: '==', value: auth.userId }] }),
      ]);
      permissions = results[0];
      tasks = results[1];
      lastError = null;
      break; // Succès
    } catch (err) {
      lastError = err;
      console.error(`[agents/GET] Firestore query attempt ${attempt}/3 failed:`, err instanceof Error ? err.message : err);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  if (lastError) {
    console.error('[agents/GET] All retry attempts failed:', lastError);
    const res = NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }

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
    console.error('[agents/GET] Error enriching agents:', err);
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

    // Check total agent limit for the user's plan
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: ['plan'],
    });
    const plan = (user?.plan as string) || 'free';
    const agentLimitCheck = await checkAgentLimit(auth.userId, plan);

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

    const agent = await db.agent.create({
      data: {
        name,
        type,
        description: description || '',
        config: config ? JSON.stringify(config) : '{}',
        avatar: avatar || null,
        userId: auth.userId,
      },
    });

    // Create default permissions for the agent
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

    await db.agentPermission.createMany({
      data: defaultPermissions.map((p) => ({
        agentId: (agent as Record<string, unknown>).id as string,
        permission: p.permission,
        granted: p.granted,
        requiresApproval: p.requiresApproval,
        userId: auth.userId,
      })),
    });

    // activityLog n'existe plus dans la façade -> audit_logs (collection dédiée)
    await db.auditLog.create({
      data: {
        action: 'Agent Created',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    // Return agent with permissions (include:{permissions} calculé en mémoire)
    const agentRow = await db.agent.findUnique({
      where: { id: (agent as Record<string, unknown>).id as string },
    });
    const perms = await db.agentPermission.findMany({
      where: [{ field: 'agentId', op: '==', value: (agent as Record<string, unknown>).id }],
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
