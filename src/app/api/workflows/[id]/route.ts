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
    const workflow = await db.workflow.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });

    if (!workflow) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 }),
        request
      );
    }

    if (workflow.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    return secureResponse(NextResponse.json(workflow), request);
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
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;

    const existing = await db.workflow.findUnique({ where: { id } });
    if (!existing) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 }),
        request
      );
    }

    if (existing.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    const body = await request.json();

    // Validate input fields
    const allowedStatuses = ['draft', 'active', 'paused', 'completed', 'archived'];
    if (body.status && !allowedStatuses.includes(body.status)) {
      return secureResponse(
        NextResponse.json({ error: 'Statut invalide' }, { status: 400 }),
        request
      );
    }

    if (body.name && (typeof body.name !== 'string' || body.name.length > 100)) {
      return secureResponse(
        NextResponse.json({ error: 'Nom invalide (max 100 caractères)' }, { status: 400 }),
        request
      );
    }

    if (body.description && (typeof body.description !== 'string' || body.description.length > 2000)) {
      return secureResponse(
        NextResponse.json({ error: 'Description trop longue (max 2000 caractères)' }, { status: 400 }),
        request
      );
    }

    if (body.steps) {
      try {
        const parsedSteps = typeof body.steps === 'string' ? JSON.parse(body.steps) : body.steps;
        if (!Array.isArray(parsedSteps) || parsedSteps.length > 100) {
          return secureResponse(
            NextResponse.json({ error: 'Étapes invalides (max 100 étapes)' }, { status: 400 }),
            request
          );
        }
      } catch {
        return secureResponse(
          NextResponse.json({ error: 'Format d\'étapes invalide' }, { status: 400 }),
          request
        );
      }
    }

    const workflow = await db.workflow.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.steps && { steps: JSON.stringify(body.steps) }),
        ...(body.trigger && { trigger: JSON.stringify(body.trigger) }),
        ...(body.status && { status: body.status }),
      },
    });

    return secureResponse(NextResponse.json(workflow), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 }),
      request
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { id } = await params;
    const workflow = await db.workflow.findUnique({ where: { id } });

    if (!workflow) {
      return secureResponse(
        NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 }),
        request
      );
    }

    if (workflow.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    await db.workflow.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Workflow supprimé',
        details: JSON.stringify({ workflowName: workflow.name }),
        category: 'workflow',
        userId: workflow.userId,
      },
    });

    return secureResponse(NextResponse.json({ success: true }), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 }),
      request
    );
  }
}
