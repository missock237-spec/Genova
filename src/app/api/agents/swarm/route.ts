// POST /api/agents/swarm — Orchestration multi-agents (swarm)
// SECURITE: withAuth() + correction IDOR (userId du token, pas du body) + quota + agent-security-middleware
import { NextRequest, NextResponse } from "next/server";
import { swarmOrchestrator } from "@/lib/agent/swarm";
import { withAuth, type RouteParams } from "@/lib/with-auth";
import { enforceSecurity, AgentSecurityBlockError } from "@/lib/security/agent-security-middleware";

export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const { task, agentIds } = await request.json();
    if (!task || !agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: "task et agentIds (non vide) requis" }, { status: 400 });
    }

    // FAIL-CLOSED: valider le prompt via le middleware de sécurité unifié
    try {
      await enforceSecurity(task, {
        agentId: agentIds[0] || 'swarm',
        userId: auth.userId,
        allowedTools: [],
        source: 'api_swarm',
      });
    } catch (secErr) {
      if (secErr instanceof AgentSecurityBlockError) {
        return NextResponse.json({ error: `Securite: ${secErr.message}` }, { status: 403 });
      }
      throw secErr;
    }

    // SECURITY: userId vient du token, jamais du body
    const results = await swarmOrchestrator.orchestrate(task, agentIds, auth.userId);
    return NextResponse.json({ results, status: swarmOrchestrator.getStatus() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 5, windowMs: 60000 },
  quota: true,
});
