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
    const { action, result } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      const res = NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate and sanitize result field
    const sanitizedResult = typeof result === 'string'
      ? result.slice(0, 500).replace(/<[^>]*>/g, '') // Max 500 chars, strip HTML
      : null;

    const approval = await db.approvalRequest.findUnique({
      where: { id },
    });

    if (!approval) {
      const res = NextResponse.json(
        { error: 'Approval request not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    if (approval.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'You do not have permission to act on this request' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    if (approval.status !== 'pending') {
      const res = NextResponse.json(
        { error: `This request has already been ${approval.status}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Use conditional update to prevent race condition
    const updateResult = await db.approvalRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status: newStatus,
        result: sanitizedResult,
        resolvedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      const res = NextResponse.json(
        { error: 'This request has already been processed by another request' },
        { status: 409 }
      );
      return secureResponse(res, request);
    }

    // If approved, execute the pending action
    if (action === 'approve') {
      let details: Record<string, unknown>;
      try {
        details = JSON.parse(approval.details);
      } catch {
        details = {};
      }

      // Log the action as completed
      await db.agentActionLog.create({
        data: {
          agentId: approval.agentId,
          action: approval.action,
          details: approval.details,
          userId: auth.userId,
          status: 'completed',
          result: JSON.stringify({
            approved: true,
            originalDetails: details,
            approverResult: sanitizedResult || 'Approved',
          }),
          resolvedAt: new Date(),
        },
      });

      await db.activityLog.create({
        data: {
          action: 'Approval Request Approved',
          details: JSON.stringify({
            approvalId: id,
            agentId: approval.agentId,
            action: approval.action,
          }),
          category: 'approval',
          userId: auth.userId,
        },
      });

      const res = NextResponse.json({
        status: newStatus,
        message: 'Request approved and action executed',
      });
      return secureResponse(res, request);
    }

    // Rejected
    await db.agentActionLog.create({
      data: {
        agentId: approval.agentId,
        action: approval.action,
        details: approval.details,
        userId: auth.userId,
        status: 'rejected',
        result: sanitizedResult || 'Rejected by user',
        resolvedAt: new Date(),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Approval Request Rejected',
        details: JSON.stringify({
          approvalId: id,
          agentId: approval.agentId,
          action: approval.action,
        }),
        category: 'approval',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      status: newStatus,
      message: 'Request rejected',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to process approval request' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
