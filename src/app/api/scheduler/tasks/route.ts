/**
 * Scheduler Tasks API — GET: List tasks, POST: Create task
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { scheduleTask, getUpcomingTasks, type AgentAction } from '@/lib/scheduler/agent-scheduler';
import { createMonitor } from '@/lib/scheduler/web-monitor';
import { scheduleReport } from '@/lib/scheduler/auto-reporter';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 100, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'active' | 'paused' | 'disabled' | 'error' | null;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const tasks = await getUpcomingTasks(auth.userId, {
      limit: Math.min(limit, 100),
      status: status || undefined,
    });

    return secureResponse(
      NextResponse.json({ tasks, total: tasks.length }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch tasks', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { name, description, schedule, timezone, agentId, action, payload, scheduleType } = body;

    if (!name || !schedule || !action) {
      return secureResponse(
        NextResponse.json(
          { error: 'Missing required fields: name, schedule, action' },
          { status: 400 }
        ),
        request
      );
    }

    // Validate action type
    const validActions: AgentAction[] = ['run_task', 'monitor_web', 'auto_report', 'send_notification', 'custom'];
    if (!validActions.includes(action)) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Route to appropriate handler based on action
    let result;

    switch (action) {
      case 'monitor_web': {
        const { url, monitorType, keywords, cssSelector, checkInterval, alertOn, threshold } = payload || {};
        if (!url || !monitorType) {
          return secureResponse(
            NextResponse.json(
              { error: 'Web monitor requires url and monitorType in payload' },
              { status: 400 }
            ),
            request
          );
        }
        result = await createMonitor({
          userId: auth.userId,
          name,
          url,
          monitorType,
          keywords,
          cssSelector,
          checkInterval: checkInterval || schedule,
          alertOn,
          threshold,
          agentId,
        });
        break;
      }
      case 'auto_report': {
        const { reportType, frequency, deliveryMethods, email, whatsappNumber, customPrompt } = payload || {};
        if (!reportType || !frequency) {
          return secureResponse(
            NextResponse.json(
              { error: 'Auto-report requires reportType and frequency in payload' },
              { status: 400 }
            ),
            request
          );
        }
        result = await scheduleReport({
          userId: auth.userId,
          name,
          reportType,
          frequency,
          deliveryMethods: deliveryMethods || ['dashboard'],
          email,
          whatsappNumber,
          agentId,
          customPrompt,
        });
        break;
      }
      default: {
        result = await scheduleTask({
          userId: auth.userId,
          agentId,
          name,
          description,
          schedule,
          timezone: timezone || 'UTC',
          scheduleType: scheduleType || 'cron',
          action,
          payload,
        });
      }
    }

    return secureResponse(
      NextResponse.json({
        success: true,
        task: {
          id: result.id,
          nextRun: result.nextRun.toISOString(),
        },
      }, { status: 201 }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to create task', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
