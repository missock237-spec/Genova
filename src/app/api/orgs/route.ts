// ============================================================
// GET /api/orgs — Organisation courante de l'utilisateur authentifié
// POST /api/orgs — Créer une organisation (le fondateur devient owner)
// ============================================================
//  Couche HTTP au-dessus de src/lib/multi-tenant/org-service.ts.
//  Résolution du tenant centralisée : un utilisateur = au plus une
//  organisation active (invariant single-tenant, voir org-service).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createLogger } from '@/lib/logger';
import {
  createOrganization,
  getOrgForUser,
  type CreateOrgInput,
} from '@/lib/multi-tenant';

export const dynamic = "force-dynamic";
const log = createLogger('orgs');

/**
 * GET /api/orgs
 * Retourne l'organisation active de l'utilisateur (ou null s'il n'en a pas).
 */
export const GET = withAuth(async (request: NextRequest, ctx, auth) => {
  try {
    const resolved = await getOrgForUser(auth.userId);
    if (!resolved) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: {
        org: resolved.org,
        role: resolved.membership.role,
      },
    });
  } catch (error) {
    log.error('orgs_fetch_error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 60, windowMs: 60000 },
});

/**
 * POST /api/orgs
 * Crée une organisation et en fait du fondateur le premier owner.
 * Refuse si l'utilisateur appartient déjà à une organisation active.
 */
export const POST = withAuth(async (request: NextRequest, ctx, auth) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ success: false, error: 'Le champ name est requis' }, { status: 400 });
  }

  const input: CreateOrgInput = {
    name: body.name,
    ownerId: auth.userId,
    plan: body.plan,
    billingEmail: body.billingEmail,
    seatLimit: typeof body.seatLimit === 'number' ? body.seatLimit : undefined,
  };

  try {
    const { org, membership } = await createOrganization(input);
    return NextResponse.json(
      { success: true, data: { org, role: membership.role } },
      { status: 201 },
    );
  } catch (error) {
    const message = String(error);
    if (message.includes('ORG_ALREADY_MEMBER')) {
      return NextResponse.json(
        { success: false, error: 'Vous appartenez déjà à une organisation active' },
        { status: 409 },
      );
    }
    log.error('orgs_create_error', { error: message });
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 10, windowMs: 60000 },
});
