/**
 * GET /api/metrics — Prometheus Metrics Endpoint
 *
 * Exposes application metrics for Prometheus/Grafana scraping
 *
 * Security (hardened) :
 * - Layer 1 (middleware) : admin-only sur /api/metrics/*
 * - Layer 2 (cette route) :
 *   1. API key via METRICS_API_KEY env var (scraping Prometheus sans session)
 *   2. Session cookie Firebase vérifiée cryptographiquement via applySecurity()
 *      + custom claim role=admin (authentification navigateur admin)
 *   3. Localhost en développement (scraping local sans clé)
 * - Aucune métrique n'est exposée sans l'un de ces trois pré-requis.
 *
 * Covers: agents, executions, credits, webhooks, errors, performance
 *
 * Note : projet migré de Prisma vers Cloud Firestore. Les requêtes
 * reposent désormais sur la façade `db` (src/lib/firestore-extra.ts).
 */

import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { applySecurity } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Vérifie l'accès au endpoint metrics.
 */
async function verifyMetricsAccess(request: NextRequest): Promise<boolean> {
  // 1. Clé API (scraping serveur-à-serveur)
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.METRICS_API_KEY;

  if (apiKey && expectedKey && apiKey === expectedKey) {
    return true;
  }

  // 2. Auth admin via cookie de session Firebase
  try {
    const { auth } = await applySecurity(request, {
      requireAuth: true,
      requireRole: "admin",
    });
    if (auth?.role === "admin") {
      return true;
    }
  } catch (_e) {
    // Vérification de session échouée
  }

  // 3. Localhost en développement
  if (process.env.NODE_ENV === "development") {
    const host = request.headers.get("host") || "";
    if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
      return true;
    }
  }

  return false;
}

interface MetricsData {
  users: number;
  activeAgents: number;
  totalExecutions: number;
  totalCreditsUsed: number;
  activeSubscriptions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  uptime: number;
  activeApiKeys: number;
  totalWebhooks: number;
  totalTerminalSessions: number;
  totalConversations: number;
  totalWorkflows: number;
  dbConnectionCount: number;
  executionByStatus: { status: string; count: number }[];
  creditsByPlan: { plan: string; total: number }[];
  recentErrors: number;
}

async function collectMetrics(): Promise<MetricsData> {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last1h = new Date(now - 3600000);

  const [
    users,
    activeAgents,
    totalExecutions,
    creditUsage,
    activeSubscriptions,
    failedExecutions,
    apiKeys,
    webhooks,
    terminalSessions,
    conversations,
    workflows,
    executions,
    allUsers,
    recentLogs,
  ] = await Promise.all([
    db.user.count({ where: { isActive: true } }),
    db.agent.count({ where: { status: { ne: "inactive" } } }).catch(() => 0),
    db.agentExecution.count().catch(() => 0),
    db.creditTransaction
      .aggregate({ where: { type: "usage" }, _sum: { amount: true } })
      .catch(() => ({ _sum: { amount: 0 } })),
    db.subscription.count({ where: { status: "active" } }).catch(() => 0),
    db.agentExecution.count({ where: { status: "failed" } }).catch(() => 0),
    db.apiKey.count().catch(() => 0),
    db.webhook.count().catch(() => 0),
    db.terminalSession.count().catch(() => 0),
    db.conversation.count().catch(() => 0),
    db.workflow.count({ where: { status: "active" } }).catch(() => 0),
    db.agentExecution.findMany().catch(() => []),
    db.user.findMany({ select: ["plan", "credits"] }).catch(() => []),
    db.auditLog
      .findMany({
        where: { createdAt: { gte: last1h } },
        select: ["action", "type"],
      })
      .catch(() => []),
  ]);

  // Erreurs récentes (1h) à partir des audit_logs
  const recentErrors = (recentLogs as Array<Record<string, unknown>>).filter((l) => {
    const a = String(l.action ?? l.type ?? '').toLowerCase();
    return a.includes('error') || a.includes('fail');
  }).length;

  // Exécutions par statut (groupement en mémoire)
  const statusCount: Record<string, number> = {};
  for (const e of executions as Array<Record<string, unknown>>) {
    const s = String(e.status ?? 'unknown');
    statusCount[s] = (statusCount[s] ?? 0) + 1;
  }
  const executionByStatus = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

  // Crédits par plan (groupement en mémoire)
  const planCredits: Record<string, number> = {};
  for (const u of allUsers as Array<Record<string, unknown>>) {
    const p = String(u.plan ?? 'free');
    planCredits[p] = (planCredits[p] ?? 0) + Number(u.credits ?? 0);
  }
  const creditsByPlan = Object.entries(planCredits).map(([plan, total]) => ({ plan, total }));

  // Temps moyen d'exécution des 100 dernières terminées
  const recentExecs = await db.agentExecution
    .findMany({
      where: {
        status: "completed",
        completedAt: { ne: null },
      },
      orderBy: { field: "createdAt", direction: "desc" },
      limit: 100,
      select: ["createdAt", "completedAt"],
    })
    .catch(() => []);

  let avgExecutionTime = 0;
  if (recentExecs.length > 0) {
    const durations = (recentExecs as Array<Record<string, unknown>>)
      .filter((e) => e.completedAt)
      .map((e) => new Date(e.completedAt as string).getTime() - new Date(e.createdAt as string).getTime());
    avgExecutionTime = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
  }

  return {
    users,
    activeAgents,
    totalExecutions,
    totalCreditsUsed: Math.abs(creditUsage._sum?.amount ?? 0),
    activeSubscriptions,
    failedExecutions,
    avgExecutionTime,
    uptime: Math.floor(process.uptime()),
    activeApiKeys: apiKeys,
    totalWebhooks: webhooks,
    totalTerminalSessions: terminalSessions,
    totalConversations: conversations,
    totalWorkflows: workflows,
    dbConnectionCount: 0,
    executionByStatus,
    creditsByPlan,
    recentErrors,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Vérification de l'accès
    const hasAccess = await verifyMetricsAccess(request);
    if (!hasAccess) {
      logger.warn("Unauthorized metrics access attempt", {
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const m = await collectMetrics();

    const lines: string[] = [];
    const add = (help: string, type: string, name: string, value: number | string, labels?: string) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(labels ? `${name}{${labels}} ${value}` : `${name} ${value}`);
      lines.push('');
    };

    // === Métriques de base ===
    add("Nombre total d'utilisateurs actifs", 'gauge', 'gen3ia_users_total', m.users);
    add("Nombre d'agents actifs", 'gauge', 'gen3ia_active_agents_total', m.activeAgents);
    add("Nombre total d'exécutions", 'counter', 'gen3ia_executions_total', m.totalExecutions);
    add("Crédits totaux consommés", 'counter', 'gen3ia_credits_used_total', m.totalCreditsUsed);
    add("Abonnements actifs", 'gauge', 'gen3ia_active_subscriptions_total', m.activeSubscriptions);
    add("Exécutions échouées", 'counter', 'gen3ia_failed_executions_total', m.failedExecutions);
    add("Temps moyen d'exécution (ms)", 'gauge', 'gen3ia_avg_execution_time_ms', m.avgExecutionTime);
    add("Uptime du service en secondes", 'gauge', 'gen3ia_uptime_seconds', m.uptime);

    // === API & Auth ===
    add("Clés API actives", 'gauge', 'gen3ia_api_keys_total', m.activeApiKeys);
    add("Webhooks configurés", 'gauge', 'gen3ia_webhooks_total', m.totalWebhooks);

    // === Terminal & Chat ===
    add("Sessions terminal actives", 'gauge', 'gen3ia_terminal_sessions_total', m.totalTerminalSessions);
    add("Conversations totales", 'counter', 'gen3ia_conversations_total', m.totalConversations);
    add("Workflows actifs", 'gauge', 'gen3ia_workflows_total', m.totalWorkflows);

    // === Erreurs ===
    add("Erreurs récentes (1h)", 'counter', 'gen3ia_recent_errors_total', m.recentErrors);

    // === Exécutions par statut ===
    for (const es of m.executionByStatus) {
      add(`Exécutions avec statut ${es.status}`, 'gauge', 'gen3ia_executions_by_status', es.count, `status="${es.status}"`);
    }

    // === Crédits par plan ===
    for (const cp of m.creditsByPlan) {
      add(`Crédits pour le plan ${cp.plan}`, 'gauge', 'gen3ia_credits_by_plan', cp.total, `plan="${cp.plan}"`);
    }

    // === Timestamp de démarrage ===
    add("Timestamp de démarrage", 'gauge', 'gen3ia_start_time', Date.now() - m.uptime * 1000);

    logger.info("Metrics exported", {
      lines: lines.length,
      metrics: Object.keys(m).length,
    });

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Metrics collection failed", { error, msg });

    return new NextResponse(
      '# ERROR Failed to collect metrics\n' + `# ${msg}`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
