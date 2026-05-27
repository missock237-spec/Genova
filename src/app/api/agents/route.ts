import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

/**
 * GET /api/agents
 * FIX: Uses authenticated user from session token (not query params).
 * Supports optional `status` query parameter to filter agents.
 * - `?status=active` → only active agents (for dashboard/agents view)
 * - `?status=inactive` → only inactive agents (for settings)
 * - no status → all agents
 */
export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const userId = auth!.userId;

    // Parse status filter from query params
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    const where: { userId: string; status?: string } = { userId };
    if (statusFilter) {
      where.status = statusFilter;
    }

    const agents = await db.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return secureResponse(request, NextResponse.json(agents));
  } catch (error) {
    console.error('[AGENTS] GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * FIX: Uses authenticated user from session token (not request body).
 * New agents are created with status "active" by default.
 */
export async function POST(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const userId = auth!.userId;
    const body = await request.json();
    const { name, type, description, config, avatar } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Nom et type requis' }, { status: 400 });
    }

    // Always use the authenticated user's ID — ignore any userId in body
    const agent = await db.agent.create({
      data: {
        name,
        type,
        description: description || '',
        config: config ? JSON.stringify(config) : '{}',
        avatar: avatar || null,
        status: 'active', // New agents are active by default
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Agent créé',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId,
      },
    });

    return secureResponse(request, NextResponse.json(agent, { status: 201 }));
  } catch (error) {
    console.error('[AGENTS] POST error:', error);
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
