import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { checkAgentLimit } from '@/lib/usage-limits';
import { sanitizeHtml, sanitizeJson, stripNullBytes, escapeForDb } from '@/lib/input-sanitizer';

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

  try {
    const agents = await db.agent.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tasks: true } },
        permissions: {
          select: {
            permission: true,
            granted: true,
            requiresApproval: true,
          },
        },
      },
    });

    const res = NextResponse.json(agents);
    return secureResponse(res, request);
  } catch {
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

  try {
    const body = await request.json();
    let { name, type, description, config, avatar } = body;

    if (!name || !type) {
      const res = NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate agent type
    const VALID_TYPES = ['sales', 'support', 'marketing', 'research', 'rh', 'accounting', 'custom', 'social_media', 'whatsapp', 'browser'];
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
      select: { plan: true },
    });
    const plan = user?.plan || 'free';
    const agentLimitCheck = await checkAgentLimit(auth.userId, plan);

    if (!agentLimitCheck.allowed) {
      const res = NextResponse.json(
        {
          error: `Agent limit reached (${agentLimitCheck.current}/${agentLimitCheck.limit}).`,
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
      { permission: 'whatsapp_message', granted: false, requiresApproval: true },
      { permission: 'whatsapp_call', granted: false, requiresApproval: true },
      { permission: 'use_api', granted: false, requiresApproval: true },
      { permission: 'use_cpu', granted: false, requiresApproval: true },
      { permission: 'use_mvp', granted: false, requiresApproval: true },
    ];

    await db.agentPermission.createMany({
      data: defaultPermissions.map((p) => ({
        agentId: agent.id,
        permission: p.permission,
        granted: p.granted,
        requiresApproval: p.requiresApproval,
        userId: auth.userId,
      })),
    });

    await db.activityLog.create({
      data: {
        action: 'Agent Created',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    // Return agent with permissions
    const agentWithPerms = await db.agent.findUnique({
      where: { id: agent.id },
      include: { permissions: true },
    });

    const res = NextResponse.json(agentWithPerms, { status: 201 });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
