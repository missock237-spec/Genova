// API Mode Autonome - Demarrage/Pause/Reprise/Annulation
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { applySecurity } from '@/lib/security';
import { agentAutonomous } from '@/lib/agent-autonomous';
import { enforceSecurity, AgentSecurityBlockError } from '@/lib/security/agent-security-middleware';

export const dynamic = "force-dynamic";
const log = createLogger('api-agents-autonomous');

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'start';

    switch (action) {
      case 'start': {
        if (!body.agentId || !body.goal) {
          return NextResponse.json({ error: 'agentId et goal requis' }, { status: 400 });
        }

        // FAIL-CLOSED: valider le goal de l'exécution autonome
        try {
          await enforceSecurity(String(body.goal), {
            agentId: body.agentId,
            userId: auth.userId,
            allowedTools: [],
            source: 'api_autonomous',
          });
        } catch (secErr) {
          if (secErr instanceof AgentSecurityBlockError) {
            return NextResponse.json({ error: `Securite: ${secErr.message}` }, { status: 403 });
          }
          throw secErr;
        }

        const run = await agentAutonomous.startRun({
          agentId: body.agentId,
          userId: auth.userId,
          goal: body.goal,
          instructions: body.instructions,
          schedule: body.schedule,
          maxDurationMs: body.maxDurationMs,
          checkpoints: body.checkpoints,
        });
        return NextResponse.json({ success: true, run }, { status: 201 });
      }

      case 'pause': {
        if (!body.runId) return NextResponse.json({ error: 'runId requis' }, { status: 400 });
        const run = await agentAutonomous.pauseRun(body.runId, body.reason);
        return NextResponse.json({ success: true, run });
      }

      case 'resume': {
        if (!body.runId) return NextResponse.json({ error: 'runId requis' }, { status: 400 });
        const run = await agentAutonomous.resumeRun(body.runId);
        return NextResponse.json({ success: true, run });
      }

      case 'cancel': {
        if (!body.runId) return NextResponse.json({ error: 'runId requis' }, { status: 400 });
        const run = await agentAutonomous.cancelRun(body.runId);
        return NextResponse.json({ success: true, run });
      }

      case 'checkpoint': {
        if (!body.checkpointId || !body.decision) {
          return NextResponse.json({ error: 'checkpointId et decision requis' }, { status: 400 });
        }
        const result = await agentAutonomous.decideCheckpoint(
          body.checkpointId, auth.userId, body.decision, body.note
        );
        return NextResponse.json({ success: true, ...result });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get('runId');
    const agentId = url.searchParams.get('agentId');

    if (runId) {
      const run = await agentAutonomous.getRunStatus(runId);
      if (!run || run.userId !== auth.userId) {
        return NextResponse.json({ error: 'Run introuvable' }, { status: 404 });
      }
      return NextResponse.json({ success: true, run });
    }

    if (agentId) {
      // Ownership check : vérifier que l'utilisateur possède l'agent
      const agent = await db.agent.findUnique({ where: { id: agentId }, select: ['userId'] });
      if (!agent || (agent as Record<string, unknown>).userId !== auth.userId) {
        return NextResponse.json({ error: 'Agent non autorise' }, { status: 403 });
      }
      const runs = await agentAutonomous.getAgentRuns(agentId);
      return NextResponse.json({ success: true, runs });
    }

    return NextResponse.json({ error: 'runId ou agentId requis' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}