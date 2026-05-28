import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const agentId = request.nextUrl.searchParams.get('agentId');

    // If agentId is provided, return action logs for that agent
    if (agentId) {
      // Verify agent ownership
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (!agent || agent.userId !== userId) {
        return secureResponse(
          NextResponse.json({ error: 'Agent not found' }, { status: 404 }),
          request
        );
      }

      const actionLogs = await db.agentActionLog.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      return secureResponse(NextResponse.json(actionLogs), request);
    }

    const activities = await db.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return secureResponse(NextResponse.json(activities), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
