// ============================================================
// POST /api/services/:id/start — Démarrer un service
// ============================================================
//  SÉCURITÉ (hardened) :
//  - Layer 1 (middleware) : admin-only sur /api/services/*
//  - Layer 2 (cette route) : applySecurity() → verifySessionCookie(true)
//    vérifie cryptographiquement le cookie Firebase + custom claims.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

/**
 * POST /api/services/:id/start
 * Start a specific service.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  // Layer 2 — vérification cryptographique Firebase (server runtime).
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: "admin",
  });
  if (secError || !auth) {
    return (
      secError ||
      NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 },
      )
    );
  }

  try {
    const { id } = await context.params;
    const manager = getServiceManager();

    const success = await manager.startService(id);

    if (!success) {
      return NextResponse.json(
        { error: `Failed to start service: ${id}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Service ${id} starting`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
