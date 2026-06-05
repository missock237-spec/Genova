import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getWorkspace, updateWorkspace, deleteWorkspace } from '@/lib/collaboration/workspace-manager';

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
    const workspace = await getWorkspace(id, auth.userId);

    if (!workspace) {
      return secureResponse(NextResponse.json({ error: 'Workspace not found' }, { status: 404 }), request);
    }

    return secureResponse(NextResponse.json(workspace), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get workspace' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const workspace = await updateWorkspace(id, auth.userId, body);
    return secureResponse(NextResponse.json(workspace), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update workspace';
    const status = message.includes('Not a member') || message.includes('role') ? 403 : 500;
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
    const deleted = await deleteWorkspace(id, auth.userId);

    if (!deleted) {
      return secureResponse(NextResponse.json({ error: 'Workspace not found' }, { status: 404 }), request);
    }

    return secureResponse(NextResponse.json({ success: true }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete workspace';
    const status = message.includes('owner') ? 403 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}
