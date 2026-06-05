/**
 * Scheduler Task [id] API — GET/PUT/DELETE: Task CRUD
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse, verifyOwnership } from '@/lib/security';
import { cancelTask, updateSchedule, executeScheduledTask } from '@/lib/scheduler/agent-scheduler';
import { db } from '@/lib/db';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 100, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { id } = await params;
    const task = await db.scheduledTask.findUnique({
      where: { id },
    });

    if (!task) {
      return secureResponse(
        NextResponse.json({ error: 'Task not found' }, { status: 404 }),
        request
      );
    }

    const ownershipError = verifyOwnership(auth.userId, task.userId, 'task');
    if (ownershipError) return secureResponse(ownershipError, request);

    return secureResponse(NextResponse.json({ task }), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch task', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { id } = await params;

    // Verify ownership
    const existing = await db.scheduledTask.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return secureResponse(
        NextResponse.json({ error: 'Task not found' }, { status: 404 }),
        request
      );
    }

    const ownershipError = verifyOwnership(auth.userId, existing.userId, 'task');
    if (ownershipError) return secureResponse(ownershipError, request);

    const body = await request.json();
    const { name, description, schedule, timezone, status, payload } = body;

    // Handle execute action
    if (body.execute) {
      const result = await executeScheduledTask(id);
      return secureResponse(
        NextResponse.json({ success: result.success, result }),
        request
      );
    }

    const result = await updateSchedule(id, auth.userId, {
      name,
      description,
      schedule,
      timezone,
      status,
      payload,
    });

    if (!result) {
      return secureResponse(
        NextResponse.json({ error: 'Failed to update task' }, { status: 400 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json({
        success: true,
        task: {
          id: result.id,
          nextRun: result.nextRun?.toISOString(),
        },
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to update task', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { id } = await params;

    // Verify ownership
    const existing = await db.scheduledTask.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return secureResponse(
        NextResponse.json({ error: 'Task not found' }, { status: 404 }),
        request
      );
    }

    const ownershipError = verifyOwnership(auth.userId, existing.userId, 'task');
    if (ownershipError) return secureResponse(ownershipError, request);

    const success = await cancelTask(id, auth.userId);

    if (!success) {
      return secureResponse(
        NextResponse.json({ error: 'Failed to cancel task' }, { status: 400 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json({ success: true, message: 'Task cancelled' }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to delete task', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
