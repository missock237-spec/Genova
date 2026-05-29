import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { shareAgent, revokeAccess, getWorkspaceSharedAgents } from '@/lib/collaboration/agent-sharing';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const sharedAgents = await getWorkspaceSharedAgents(id, auth.userId);
    return secureResponse(NextResponse.json(sharedAgents), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get shared agents';
    const status = message.includes('Not a member') ? 403 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'revoke') {
      const { agentId } = body;
      if (!agentId) {
        return secureResponse(NextResponse.json({ error: 'agentId required' }, { status: 400 }), request);
      }
      const revoked = await revokeAccess(id, agentId, auth.userId);
      return secureResponse(NextResponse.json({ success: revoked }), request);
    }

    // Default: share agent
    const { agentId, permissions } = body;
    if (!agentId) {
      return secureResponse(NextResponse.json({ error: 'agentId is required' }, { status: 400 }), request);
    }

    const sharedAgent = await shareAgent({
      workspaceId: id,
      agentId,
      sharedBy: auth.userId,
      permissions,
    });

    return secureResponse(NextResponse.json(sharedAgent, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to manage shared agent';
    const status = message.includes('Not a member') || message.includes('Insufficient') || message.includes('own this agent') ? 403 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}
