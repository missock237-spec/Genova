// ============================================================
// GET /api/orgs/[orgId] — Détail d'une organisation (membre actif requis)
// PATCH /api/orgs/[orgId] — Mettre à jour plan / statut (org:write requis)
// ============================================================
//  L'accès est verifié par appartenance active (getOrgForUserById) et par
//  permission (getOrgContext().can) — deux niveaux, comme partout ailleurs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createLogger } from '@/lib/logger';
import {
  getOrgForUserById,
  getOrgContext,
  setOrgPlan,
  setOrgStatus,
  normalizeOrgPlan,
  normalizeOrgStatus,
} from '@/lib/multi-tenant';

export const dynamic = "force-dynamic";
const log = createLogger('org');

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

    return NextResponse.json({
      success: true,
      data: { org: resolved.org, role: resolved.membership.role },
    });
  } catch (error) {
    log.error('org_fetch_error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 60, windowMs: 60000 },
});

/**
 * PATCH /api/orgs/[orgId]
 * Change le plan et/ou le statut. Réservé aux rôles possédant `org:write`.
 * NOTE : la règle Firestore `organizations.update` reste `isAdmin()` ;
 * l'écriture réelle passe par l'Admin SDK (org-service), le contrôle
 * applicatif est ici `getOrgContext().can('org:write')`.
 */
export const PATCH = withAuth(async (request: NextRequest, ctx, auth) => {
  const params = (await ctx.params) as { orgId?: string };
  const orgId = params?.orgId;
  if (!orgId) {
    return NextResponse.json({ success: false, error: 'orgId requise' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || (body.plan === undefined && body.status === undefined)) {
    return NextResponse.json({ success: false, error: 'Aucun champ à mettre à jour (plan ou status)' }, { status: 400 });
  }

  try {
    const orgCtx = await getOrgContext(auth.userId);
    if (!orgCtx.member || orgCtx.org?.org.id !== orgId) {
      return NextResponse.json({ success: false, error: 'Accès refusé' }, { status: 403 });
    }
    if (!orgCtx.can('org:write')) {
      return NextResponse.json({ success: false, error: 'Permissions insuffisantes' }, { status: 403 });
    }

    if (body.plan !== undefined) {
      await setOrgPlan(orgId, normalizeOrgPlan(body.plan), typeof body.seatLimit === 'number' ? body.seatLimit : undefined);
    }
    if (body.status !== undefined) {
      await setOrgStatus(orgId, normalizeOrgStatus(body.status));
    }

    const refreshed = await getOrgForUserById(auth.userId, orgId);
    return NextResponse.json({
      success: true,
      data: refreshed ? { org: refreshed.org } : null,
    });
  } catch (error) {
    const message = String(error);
    if (message.includes('PLAN_INVALID') || message.includes('STATUS_INVALID')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    log.error('org_patch_error', { error: message });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 30, windowMs: 60000 },
});
