// ============================================================
// PATCH /api/orgs/[orgId]/members/[userId] — Changer le rôle d'un membre
// DELETE /api/orgs/[orgId]/members/[userId] — Retirer un membre
// ============================================================
//  Accès : `org:members:manage` requis (owner / admin). Les invariants
//  métier sont garantis par org-service (dernier owner non dégradable).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createLogger } from '@/lib/logger';
import {
  getOrgContext,
  updateMemberRole,
  removeMember,
  normalizeOrgRole,
} from '@/lib/multi-tenant';

export const dynamic = "force-dynamic";
const log = createLogger('org-member');

async function requireManagedOrg(orgId: string, authUserId: string) {
  const ctx = await getOrgContext(authUserId);
  if (!ctx.member || ctx.org?.org.id !== orgId) {
    return { error: NextResponse.json({ success: false, error: 'Accès refusé' }, { status: 403 }) };
  }
  if (!ctx.can('org:members:manage')) {
    return { error: NextResponse.json({ success: false, error: 'Permissions insuffisantes' }, { status: 403 }) };
  }
  return {};
}

export const PATCH = withAuth(async (request: NextRequest, ctx, auth) => {
  const params = (await ctx.params) as { orgId?: string; userId?: string };
  const orgId = params?.orgId;
  const userId = params?.userId;
  if (!orgId || !userId) {
    return NextResponse.json({ success: false, error: 'orgId et userId requises' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.role === undefined || body.role === null) {
    return NextResponse.json({ success: false, error: 'Le champ role est requis' }, { status: 400 });
  }

  const newRole = normalizeOrgRole(body.role);

  try {
    const guard = await requireManagedOrg(orgId, auth.userId);
    if (guard.error) return guard.error;

    await updateMemberRole(userId, orgId, newRole);
    return NextResponse.json({ success: true, data: { userId, orgId, role: newRole } });
  } catch (error) {
    const message = String(error);
    if (message.includes('LAST_OWNER')) {
      return NextResponse.json(
        { success: false, error: 'Impossible de dégrader le dernier owner de l’organisation' },
        { status: 409 },
      );
    }
    if (message.includes('MEMBERSHIP_NOT_FOUND')) {
      return NextResponse.json({ success: false, error: 'Membre introuvable' }, { status: 404 });
    }
    log.error('org_member_role_error', { error: message });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 30, windowMs: 60000 },
});

export const DELETE = withAuth(async (request: NextRequest, ctx, auth) => {
  const params = (await ctx.params) as { orgId?: string; userId?: string };
  const orgId = params?.orgId;
  const userId = params?.userId;
  if (!orgId || !userId) {
    return NextResponse.json({ success: false, error: 'orgId et userId requises' }, { status: 400 });
  }

  try {
    const guard = await requireManagedOrg(orgId, auth.userId);
    if (guard.error) return guard.error;

    await removeMember(userId, orgId);
    return NextResponse.json({ success: true, data: { userId, orgId, status: 'removed' } });
  } catch (error) {
    const message = String(error);
    if (message.includes('LAST_OWNER')) {
      return NextResponse.json(
        { success: false, error: 'Impossible de retirer le dernier owner de l’organisation' },
        { status: 409 },
      );
    }
    if (message.includes('MEMBERSHIP_NOT_FOUND')) {
      return NextResponse.json({ success: false, error: 'Membre introuvable' }, { status: 404 });
    }
    log.error('org_member_remove_error', { error: message });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 30, windowMs: 60000 },
});
