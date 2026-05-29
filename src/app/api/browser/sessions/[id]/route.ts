/**
 * API Route: /api/browser/sessions/[id]
 * GET: Get browser session state
 * DELETE: Close/delete browser session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createBrowserAutomationEngine } from '@/lib/browser/browser-automation';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const engine = createBrowserAutomationEngine(auth.userId);
    const session = await engine.getSession(id);

    if (!session) {
      const res = NextResponse.json({ error: 'Session not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    const res = NextResponse.json({ session });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get session';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const engine = createBrowserAutomationEngine(auth.userId);
    const session = await engine.getSession(id);

    if (!session) {
      const res = NextResponse.json({ error: 'Session not found' }, { status: 404 });
      return secureResponse(res, request);
    }

    if (session.status === 'running') {
      await engine.closeSession(id);
    } else {
      await engine.deleteSession(id);
    }

    const res = NextResponse.json({
      success: true,
      message: 'Session closed',
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to close session';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
