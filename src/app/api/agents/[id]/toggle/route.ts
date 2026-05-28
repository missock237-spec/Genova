import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { checkConcurrentAgents } from '@/lib/usage-limits';

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
    const agent = await db.agent.findUnique({ where: { id } });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    const newStatus = agent.status === 'active' ? 'inactive' : 'active';

    // Check concurrent agent limits before allowing activation
    if (newStatus === 'active') {
      // Parse request body for optional isMultiAgent flag
      let isMultiAgent = false;
      try {
        const body = await request.json().catch(() => ({}));
        isMultiAgent = body?.isMultiAgent === true;
      } catch {
        // No body or invalid JSON — default to false
      }

      // Look up user's plan
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: { plan: true },
      });
      const plan = user?.plan || 'free';

      const concurrentCheck = await checkConcurrentAgents(auth.userId, plan, isMultiAgent);
      if (!concurrentCheck.allowed) {
        const upgradeMessage = plan === 'free'
          ? ' Upgrade to Pro for up to 5 concurrent agents.'
          : ' You have reached the maximum concurrent agents for your plan.';

        const res = NextResponse.json(
          {
            error: `Concurrent agent limit reached (${concurrentCheck.current}/${concurrentCheck.limit}).${upgradeMessage}`,
            code: 'CONCURRENT_LIMIT_REACHED',
            current: concurrentCheck.current,
            limit: concurrentCheck.limit,
          },
          { status: 403 }
        );
        return secureResponse(res, request);
      }
    }

    // Use atomic conditional update to prevent race condition
    const updateResult = await db.agent.updateMany({
      where: { id, status: agent.status },
      data: { status: newStatus },
    });

    if (updateResult.count === 0) {
      const res = NextResponse.json(
        { error: 'Agent status was modified by another request' },
        { status: 409 }
      );
      return secureResponse(res, request);
    }

    await db.activityLog.create({
      data: {
        action: `Agent ${newStatus === 'active' ? 'Activated' : 'Deactivated'}`,
        details: JSON.stringify({ agentName: agent.name, status: newStatus }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({ id: agent.id, status: newStatus });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to toggle agent status' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
