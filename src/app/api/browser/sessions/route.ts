/**
 * API Route: /api/browser/sessions
 * GET: List browser automation sessions
 * POST: Create a new browser automation session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createBrowserAutomationEngine, type ActionType } from '@/lib/browser/browser-automation';

const VALID_ACTION_TYPES: ActionType[] = [
  'navigate', 'click', 'type', 'scroll', 'screenshot',
  'extract', 'fill_form', 'wait', 'hover', 'select',
  'press_key', 'evaluate',
];

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const engine = createBrowserAutomationEngine(auth.userId);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;

    const sessions = await engine.listSessions(status as any);

    const res = NextResponse.json({
      sessions,
      total: sessions.length,
    });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list sessions';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { url, agentId, actions, config } = body;

    if (!url || typeof url !== 'string') {
      const res = NextResponse.json({ error: 'Starting URL is required' }, { status: 400 });
      return secureResponse(res, request);
    }

    try {
      new URL(url);
    } catch {
      const res = NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      return secureResponse(res, request);
    }

    // Validate actions if provided
    if (actions && Array.isArray(actions)) {
      for (const action of actions) {
        if (!VALID_ACTION_TYPES.includes(action.type)) {
          const res = NextResponse.json(
            { error: `Invalid action type: ${action.type}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` },
            { status: 400 }
          );
          return secureResponse(res, request);
        }
      }
    }

    const engine = createBrowserAutomationEngine(auth.userId);
    const session = await engine.createSession({
      url,
      agentId,
      actions,
      config,
    });

    const res = NextResponse.json({ session }, { status: 201 });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
