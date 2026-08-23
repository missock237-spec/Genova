// ============================================================
// GET /api/orgs/[orgId]/members — Liste des membres actifs
// POST /api/orgs/[orgId]/members — Ajouter un membre
// ============================================================
//  Accès : membre actif de l'organisation (getOrgForUserById), avec
//  `org:members:manage` requis pour l'ajout (owner / admin).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createLogger } from '@/lib/logger';
import {
  getOrgForUserById,
  getOrgContext,
  listOrgMembers,
  addMember,
  normalizeOrgRole,
} from '@/lib/multi-tenant';

export const dynamic = "force-dynamic";
const log = createLogger('org-members');

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

export const GET = withAuth(async (request: NextRequest, ctx, auth) => {
  const params = (await ctx.params) as { orgId?: string };
  const orgId = params?.orgId;
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'orgId requise' }, { status: 400 });
  }

  try {
    const resolved = await getOrgForUserById(auth.userId, orgId);
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Organisation introuvable ou accès refusé' }, { status: 404 });
    }

    const members = await listOrgMembers(orgId);
    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    log.error('org_members_fetch_error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 60, windowMs: 60000 },
});

export const POST = withAuth(async (request: NextRequest, ctx, auth) => {
  const params = (await ctx.params) as { orgId?: string };
  const orgId = params?.orgId;
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'orgId requise' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.userId !== 'string' || !body.userId) {
    return NextResponse.json({ success: false, error: 'Le champ userId est requis' }, { status: 400 });
  }

  try {
    const guard = await requireManagedOrg(orgId, auth.userId);
    if (guard.error) return guard.error;

    const membership = await addMember({
      orgId,
      userId: body.userId,
      role: normalizeOrgRole(body.role),
      invitedBy: auth.userId,
    });
    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error) {
    const message = String(error);
    if (message.includes('MEMBER_ALREADY_ACTIVE')) {
      return NextResponse.json(
        { success: false, error: 'Cet utilisateur est déjà membre d’une organisation' },
        { status: 409 },
      );
    }
    log.error('org_member_add_error', { error: message });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 30, windowMs: 60000 },
});
