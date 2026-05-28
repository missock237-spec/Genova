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
    const guardrail = await db.guardrail.findUnique({
      where: { id },
      include: { validations: { take: 20, orderBy: { createdAt: 'desc' } } },
    });

    if (!guardrail) {
      return secureResponse(
        NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 }),
        request
      );
    }

    if (guardrail.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    return secureResponse(NextResponse.json(guardrail), request);
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

    const existing = await db.guardrail.findUnique({ where: { id } });
    if (!existing) {
      return secureResponse(
        NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 }),
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

    // Validate input fields on update
    const VALID_TYPES = ['content_filter', 'rate_limit', 'permission', 'custom'];
    const VALID_SEVERITIES = ['info', 'warning', 'critical', 'blocking'];

    if (body.type && !VALID_TYPES.includes(body.type)) {
      return secureResponse(
        NextResponse.json({ error: `Type invalide. Valeurs autorisées: ${VALID_TYPES.join(', ')}` }, { status: 400 }),
        request
      );
    }

    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return secureResponse(
        NextResponse.json({ error: `Sévérité invalide. Valeurs autorisées: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 }),
        request
      );
    }

    if (body.name && (typeof body.name !== 'string' || body.name.length > 100)) {
      return secureResponse(
        NextResponse.json({ error: 'Nom invalide (max 100 caractères)' }, { status: 400 }),
        request
      );
    }

    if (body.description && (typeof body.description !== 'string' || body.description.length > 1000)) {
      return secureResponse(
        NextResponse.json({ error: 'Description trop longue (max 1000 caractères)' }, { status: 400 }),
        request
      );
    }

    const guardrail = await db.guardrail.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.type && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.rules && { rules: JSON.stringify(body.rules) }),
        ...(body.severity && { severity: body.severity }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return secureResponse(NextResponse.json(guardrail), request);
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
    const guardrail = await db.guardrail.findUnique({ where: { id } });

    if (!guardrail) {
      return secureResponse(
        NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 }),
        request
      );
    }

    if (guardrail.userId !== auth.userId) {
      return secureResponse(
        NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }),
        request
      );
    }

    await db.guardrail.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Garde-fou supprimé',
        details: JSON.stringify({ guardrailName: guardrail.name }),
        category: 'guardrail',
        userId: guardrail.userId,
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
