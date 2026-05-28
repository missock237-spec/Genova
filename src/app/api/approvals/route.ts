import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const statusFilter = request.nextUrl.searchParams.get('status');

    // Validate status filter
    if (statusFilter && !['pending', 'approved', 'rejected'].includes(statusFilter)) {
      const res = NextResponse.json(
        { error: 'Invalid status filter' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const approvals = await db.approvalRequest.findMany({
      where: {
        userId: auth.userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    // Enrich with agent name
    const enrichedApprovals = await Promise.all(
      approvals.map(async (approval) => {
        const agent = await db.agent.findUnique({
          where: { id: approval.agentId },
          select: { name: true, type: true },
        });
        return {
          id: approval.id,
          agentId: approval.agentId,
          agentName: agent?.name || 'Unknown Agent',
          agentType: agent?.type || 'unknown',
          action: approval.action,
          details: approval.details,
          status: approval.status,
          result: approval.result,
          createdAt: approval.createdAt,
          resolvedAt: approval.resolvedAt,
        };
      })
    );

    const res = NextResponse.json(enrichedApprovals);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch approval requests' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
