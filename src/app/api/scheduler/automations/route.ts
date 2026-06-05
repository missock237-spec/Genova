/**
 * Scheduler Automations API — GET/POST: Automation rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';

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
    const trigger = searchParams.get('trigger');
    const isActive = searchParams.get('active');

    const where: Record<string, unknown> = { userId: auth.userId };
    if (trigger) where.trigger = trigger;
    if (isActive !== null) where.isActive = isActive === 'true';

    const automations = await db.agentAutomation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return secureResponse(
      NextResponse.json({ automations, total: automations.length }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch automations', details: err instanceof Error ? err.message : 'Unknown error' },
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
    const { name, description, agentId, trigger, conditions, actions, isActive, metadata } = body;

    if (!name || !trigger) {
      return secureResponse(
        NextResponse.json(
          { error: 'Missing required fields: name, trigger' },
          { status: 400 }
        ),
        request
      );
    }

    // Validate trigger type
    const validTriggers = ['event', 'schedule', 'webhook', 'condition'];
    if (!validTriggers.includes(trigger)) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid trigger. Must be one of: ${validTriggers.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    // Validate actions
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      return secureResponse(
        NextResponse.json(
          { error: 'At least one action is required' },
          { status: 400 }
        ),
        request
      );
    }

    const automation = await db.agentAutomation.create({
      data: {
        userId: auth.userId,
        agentId: agentId || null,
        name,
        description: description || '',
        trigger,
        conditions: JSON.stringify(conditions || []),
        actions: JSON.stringify(actions),
        isActive: isActive !== false,
        metadata: JSON.stringify(metadata || {}),
      },
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        automation: {
          id: automation.id,
          name: automation.name,
          trigger: automation.trigger,
          isActive: automation.isActive,
          createdAt: automation.createdAt.toISOString(),
        },
      }, { status: 201 }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to create automation', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
