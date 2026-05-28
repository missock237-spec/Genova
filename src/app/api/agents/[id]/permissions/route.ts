import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const AVAILABLE_PERMISSIONS = [
  'browse_web',
  'social_post',
  'social_youtube',
  'social_facebook',
  'social_instagram',
  'social_tiktok',
  'social_linkedin',
  'whatsapp_message',
  'whatsapp_call',
  'use_api',
  'use_cpu',
  'use_mvp',
];

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    const agent = await db.agent.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    const res = NextResponse.json({
      agentId: agent.id,
      permissions: agent.permissions.map((p) => ({
        id: p.id,
        permission: p.permission,
        granted: p.granted,
        requiresApproval: p.requiresApproval,
      })),
      availablePermissions: AVAILABLE_PERMISSIONS,
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch permissions' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { permissions } = body;

    if (!permissions || !Array.isArray(permissions)) {
      const res = NextResponse.json(
        { error: 'Permissions array is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const agent = await db.agent.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Validate all permissions
    for (const perm of permissions) {
      if (!AVAILABLE_PERMISSIONS.includes(perm.permission)) {
        const res = NextResponse.json(
          { error: `Invalid permission: ${perm.permission}` },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    // Update or create permissions
    const results: Array<{ id: string; permission: string; granted: boolean; requiresApproval: boolean }> = [];
    for (const perm of permissions) {
      const existing = agent.permissions.find((p) => p.permission === perm.permission);

      if (existing) {
        const updated = await db.agentPermission.update({
          where: { id: existing.id },
          data: {
            granted: perm.granted ?? existing.granted,
            requiresApproval: perm.requiresApproval ?? existing.requiresApproval,
          },
        });
        results.push(updated);
      } else {
        const created = await db.agentPermission.create({
          data: {
            agentId: agent.id,
            permission: perm.permission,
            granted: perm.granted ?? false,
            requiresApproval: perm.requiresApproval ?? true,
            userId: auth.userId,
          },
        });
        results.push(created);
      }
    }

    await db.activityLog.create({
      data: {
        action: 'Agent Permissions Updated',
        details: JSON.stringify({
          agentId: agent.id,
          agentName: agent.name,
          updatedPermissions: permissions.map((p: { permission: string; granted: boolean; requiresApproval: boolean }) => p.permission),
        }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      agentId: agent.id,
      permissions: results.map((p) => ({
        id: p.id,
        permission: p.permission,
        granted: p.granted,
        requiresApproval: p.requiresApproval,
      })),
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to update permissions' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
