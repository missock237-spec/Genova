import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { task, parameters } = body;

    if (!task) {
      const res = NextResponse.json(
        { error: 'Task description is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (task.length > 1000) {
      const res = NextResponse.json(
        { error: 'Task description must be at most 1000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const agent = await db.agent.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Validate and determine required permission
    const VALID_PERMISSIONS = [
      'browse_web',
      'social_post',
      'whatsapp_message',
      'whatsapp_call',
      'use_api',
      'use_cpu',
      'use_mvp',
    ];

    // If a specific permission is requested, validate and enforce it
    if (body.permission) {
      if (!VALID_PERMISSIONS.includes(body.permission)) {
        const res = NextResponse.json(
          { error: `Invalid permission. Allowed: ${VALID_PERMISSIONS.join(', ')}` },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    const requiredPermission = body.permission || null;

    // Check permission if determined
    if (requiredPermission) {
      const perm = agent.permissions.find((p) => p.permission === requiredPermission);
      if (!perm || !perm.granted) {
        const res = NextResponse.json(
          { error: `Agent does not have permission: ${requiredPermission}` },
          { status: 403 }
        );
        return secureResponse(res, request);
      }

      // Check if approval is needed
      if (perm.requiresApproval) {
        const approval = await db.approvalRequest.create({
          data: {
            agentId: id,
            action: `execute_task`,
            details: JSON.stringify({
              task,
              parameters: parameters || {},
              requiredPermission,
            }),
            userId: auth.userId,
            status: 'pending',
          },
        });

        const res = NextResponse.json({
          requiresApproval: true,
          approvalId: approval.id,
          message: 'Task requires approval before execution',
        });
        return secureResponse(res, request);
      }
    }

    // Create task record
    const taskRecord = await db.task.create({
      data: {
        title: task,
        description: parameters ? JSON.stringify(parameters) : null,
        status: 'running',
        priority: 'medium',
        agentId: id,
        userId: auth.userId,
      },
    });

    // Log the action
    await db.agentActionLog.create({
      data: {
        agentId: id,
        action: 'execute_task',
        details: JSON.stringify({ task, parameters: parameters || {}, taskId: taskRecord.id }),
        userId: auth.userId,
        status: 'running',
        result: JSON.stringify({ taskId: taskRecord.id, status: 'running' }),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Agent Task Executed',
        details: JSON.stringify({ agentId: id, agentName: agent.name, task, taskId: taskRecord.id }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      requiresApproval: false,
      taskId: taskRecord.id,
      status: taskRecord.status,
      message: 'Task created and executing',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to execute task' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
