import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { inviteMember, updateRole, removeMember } from '@/lib/collaboration/workspace-manager';

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
    const { getWorkspace } = await import('@/lib/collaboration/workspace-manager');
    const workspace = await getWorkspace(id, auth.userId);

    if (!workspace) {
      return secureResponse(NextResponse.json({ error: 'Workspace not found' }, { status: 404 }), request);
    }

    return secureResponse(NextResponse.json(workspace.members || []), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get members' }, { status: 500 });
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

    if (action === 'updateRole') {
      const { userId: targetUserId, role } = body;
      if (!targetUserId || !role) {
        return secureResponse(NextResponse.json({ error: 'userId and role are required' }, { status: 400 }), request);
      }
      const member = await updateRole(id, targetUserId, role, auth.userId);
      return secureResponse(NextResponse.json(member), request);
    }

    // Default: invite member
    const { userId: targetUserId, role } = body;
    if (!targetUserId) {
      return secureResponse(NextResponse.json({ error: 'userId is required' }, { status: 400 }), request);
    }

    const member = await inviteMember({
      workspaceId: id,
      userId: targetUserId,
      role: role || 'member',
      invitedBy: auth.userId,
    });

    return secureResponse(NextResponse.json(member, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to manage members';
    const status = message.includes('Not a member') || message.includes('role') || message.includes('owner') ? 403 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return secureResponse(NextResponse.json({ error: 'userId query parameter required' }, { status: 400 }), request);
    }

    const removed = await removeMember(id, userId, auth.userId);
    return secureResponse(NextResponse.json({ success: removed }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove member';
    const status = message.includes('Not a member') || message.includes('owner') ? 403 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}
