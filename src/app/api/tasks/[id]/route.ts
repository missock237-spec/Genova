import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const task = await db.task.findUnique({
      where: { id },
      include: {
        agent: true,
        workflow: true,
        validations: { include: { guardrail: true } },
      },
    });

    if (!task) {
      return secureResponse(
        NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 }),
        request
      );
    }

    if (task.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    return secureResponse(NextResponse.json(task), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    // Verify task ownership
    const task = await db.task.findUnique({ where: { id } });
    if (!task) {
      return secureResponse(
        NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 }),
        request
      );
    }

    if (task.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    // Validate status if provided
    const validStatuses = ['pending', 'running', 'completed', 'failed', 'validated'];
    if (body.status && !validStatuses.includes(body.status)) {
      return secureResponse(
        NextResponse.json({ error: `Statut invalide. Valeurs autorisées: ${validStatuses.join(', ')}` }, { status: 400 }),
        request
      );
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (body.priority && !validPriorities.includes(body.priority)) {
      return secureResponse(
        NextResponse.json({ error: `Priorité invalide. Valeurs autorisées: ${validPriorities.join(', ')}` }, { status: 400 }),
        request
      );
    }

    const updated = await db.task.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.priority && { priority: body.priority }),
        ...(body.result !== undefined && { result: body.result }),
        ...(body.agentId !== undefined && { agentId: body.agentId || null }),
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Tâche mise à jour',
        details: JSON.stringify({ taskId: id, updates: Object.keys(body) }),
        category: 'system',
        userId: auth.userId,
      },
    });

    return secureResponse(NextResponse.json(updated), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
