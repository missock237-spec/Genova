import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';

/**
 * GET /api/agents
 * FIX (Bug #5): Original accepted `userId` from query params without verifying
 * the authenticated user — any client could read another user's agents.
 * Now uses Bearer token authorization: the userId is extracted from the
 * validated session token, NOT from the query string.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Non autorisé — token invalide ou manquant' }, { status: 401 });
    }

    // Use the authenticated user's ID — ignore any userId in query params
    const agents = await db.agent.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return NextResponse.json(agents);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * FIX (Bug #5): Original accepted `userId` from request body without verifying
 * the authenticated user — any client could create agents under another user.
 * Now uses Bearer token authorization: the userId comes from the validated session.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: 'Non autorisé — token invalide ou manquant' }, { status: 401 });
    }

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
        userId: auth.userId, // Secure: comes from validated session token
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Agent créé',
        details: JSON.stringify({ agentName: name, type }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
