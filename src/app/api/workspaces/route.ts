import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createWorkspace, listUserWorkspaces } from '@/lib/collaboration/workspace-manager';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const workspaces = await listUserWorkspaces(auth.userId);
    return secureResponse(NextResponse.json(workspaces), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to list workspaces' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description, icon, settings } = body;

    if (!name) {
      return secureResponse(NextResponse.json({ error: 'Name is required' }, { status: 400 }), request);
    }

    const workspace = await createWorkspace(auth.userId, { name, description, icon, settings });
    return secureResponse(NextResponse.json(workspace, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create workspace';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
