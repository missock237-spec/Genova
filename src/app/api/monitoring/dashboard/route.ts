// ============================================================
// MONITORING DASHBOARD — Métriques en temps réel
// ============================================================
//  SÉCURITÉ (hardened) :
//  - Layer 1 (middleware) : admin-only sur /api/monitoring/*
//  - Layer 2 (cette route) : applySecurity() → verifySessionCookie(true)
//    vérifie cryptographiquement le cookie Firebase + custom claims.
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
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      totalAgents,
      activeAgents,
      totalExecutions,
      todayExecutions,
      totalWorkflows,
      activeWorkflows,
      recentErrors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.agent.count(),
      prisma.agent.count({ where: { status: "active" } }),
      prisma.agentExecution.count(),
      prisma.agentExecution.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.workflow.count(),
      prisma.workflow.count({ where: { status: "active" } }),
      prisma.monitoringEvent.findMany({
        where: { severity: { in: ["error", "critical"] }, resolved: false },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: { total: totalUsers },
        agents: { total: totalAgents, active: activeAgents },
        executions: { total: totalExecutions, today: todayExecutions },
        workflows: { total: totalWorkflows, active: activeWorkflows },
        errors: { unresolved: recentErrors.length, recent: recentErrors },
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Dashboard monitoring error:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des métriques" },
      { status: 500 }
    );
  }
}
