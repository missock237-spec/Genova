/**
 * API Route: /api/browser/execute
 * POST: Execute a browser action or script
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

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { sessionId, action, actions, mode } = body;

    const engine = createBrowserAutomationEngine(auth.userId);

    if (mode === 'script' && actions && Array.isArray(actions)) {
      // Execute multiple actions as a script
      if (!sessionId) {
        const res = NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        return secureResponse(res, request);
      }

      for (const a of actions) {
        if (!VALID_ACTION_TYPES.includes(a.type)) {
          const res = NextResponse.json(
            { error: `Invalid action type: ${a.type}` },
            { status: 400 }
          );
          return secureResponse(res, request);
        }
      }

      const result = await engine.executeScript(sessionId, actions);

      const res = NextResponse.json({
        result,
        message: `Script executed: ${result.completedSteps} steps completed`,
      });
      return secureResponse(res, request);
    }

    if (action) {
      // Execute single action
      if (!sessionId) {
        const res = NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        return secureResponse(res, request);
      }

      if (!VALID_ACTION_TYPES.includes(action.type)) {
        const res = NextResponse.json(
          { error: `Invalid action type: ${action.type}. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` },
          { status: 400 }
        );
        return secureResponse(res, request);
      }

      const result = await engine.executeAction(sessionId, action);

      const res = NextResponse.json({
        result,
        message: result.success ? 'Action executed successfully' : 'Action failed',
      });
      return secureResponse(res, request);
    }

    const res = NextResponse.json(
      { error: 'Either action or actions (for script mode) is required' },
      { status: 400 }
    );
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
