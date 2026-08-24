import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { agentDelegation } from '@/lib/agent-delegation';
import { enforceSecurity, AgentSecurityBlockError } from '@/lib/security/agent-security-middleware';

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'delegate';
    switch (action) {
      case 'delegate': {
        if (!body.sourceAgentId || !body.targetAgentId || !body.task) {
          return NextResponse.json({ error: 'sourceAgentId, targetAgentId et task requis' }, { status: 400 });
        }

        // FAIL-CLOSED: valider la tâche de délégation
        try {
          await enforceSecurity(String(body.task), {
            agentId: body.sourceAgentId,
            userId: auth.userId,
            allowedTools: [],
            source: 'api_delegate',
          });
        } catch (secErr) {
          if (secErr instanceof AgentSecurityBlockError) {
            return NextResponse.json({ error: `Securite: ${secErr.message}` }, { status: 403 });
          }
          throw secErr;
        }

        const wait = body.wait !== false;
        if (wait) {
          const result = await agentDelegation.delegateAndWait({
            sourceAgentId: body.sourceAgentId, targetAgentId: body.targetAgentId,
            task: body.task, context: body.context, priority: body.priority, maxWaitMs: body.maxWaitMs || 30000,
          });
          return NextResponse.json({ success: true, ...result });
        }
        const delegation = await agentDelegation.delegate({
          sourceAgentId: body.sourceAgentId, targetAgentId: body.targetAgentId,
          task: body.task, context: body.context, priority: body.priority, maxWaitMs: body.maxWaitMs,
        });
        return NextResponse.json({ success: true, delegation });
      }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
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
    const agentId = url.searchParams.get('agentId');
    const direction = url.searchParams.get('direction') || 'source';
    if (!agentId) return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
    const delegations = await agentDelegation.getDelegations(agentId, direction === 'source');
    return NextResponse.json({ success: true, delegations });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}