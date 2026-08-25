// ============================================================
// GET /api/admin/guardrails — Alertes guardrails (supervisor)
// ============================================================
//  Liste les décisions "stop" du supervisor (agents arrêtés pour
//  dépassement de budget / boucle / erreur critique), groupées par
//  raison et par agent.
//
//  SÉCURITÉ (hardened) :
//  - Layer 1 (middleware) : exige session cookie + payload role=admin
//  - Layer 2 (cette route) : applySecurity() → verifySessionCookie(true)
//    vérifie cryptographiquement le cookie Firebase + custom claims réels.
//  - Aucune donnée n'est retournée sans rôle admin vérifié.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applySecurity } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Layer 2 — vérification cryptographique Firebase (server runtime).
  // Voir commentaire détaillé dans /api/admin/supervision/route.ts.
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
    const [total, byReason, byAgent, recent] = await Promise.all([
      prisma.supervisorLog.count({ where: { decision: "stop" } }),
      prisma.supervisorLog.groupBy({
        by: ["reason"],
        where: { decision: "stop" },
        _count: true,
        orderBy: { _count: { reason: "desc" } },
      }),
      prisma.supervisorLog.groupBy({
        by: ["agentId"],
        where: { decision: "stop" },
        _count: true,
        orderBy: { _count: { agentId: "desc" } },
        take: 10,
      }),
      prisma.supervisorLog.findMany({
        where: { decision: { not: "continue" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          agentId: true,
          reason: true,
          decision: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      totalAlerts: total,
      byReason,
      topAgents: byAgent,
      recentAlerts: recent,
    });
  } catch (error) {
    console.error("[admin_guardrails_error]", {
      adminId: auth.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
