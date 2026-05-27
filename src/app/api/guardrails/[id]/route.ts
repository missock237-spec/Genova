import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';
import { validateBody, updateGuardrailSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({
      where: { id },
      include: { validations: { take: 20, orderBy: { createdAt: 'desc' } } },
    });

    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, guardrail.userId, 'Garde-fou');
    if (ownershipError) return ownershipError;

    return secureResponse(request, NextResponse.json(guardrail));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'write' });
    if (error) return error;

    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });
    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, guardrail.userId, 'Garde-fou');
    if (ownershipError) return ownershipError;

    const body = await request.json();
    const validation = validateBody(updateGuardrailSchema, body);
    if (!validation.success) return validation.error;

    const updated = await db.guardrail.update({
      where: { id },
      data: {
        ...(validation.data.name && { name: validation.data.name }),
        ...(validation.data.type && { type: validation.data.type }),
        ...(validation.data.description !== undefined && { description: validation.data.description }),
        ...(validation.data.rules && { rules: JSON.stringify(validation.data.rules) }),
        ...(validation.data.severity && { severity: validation.data.severity }),
        ...(validation.data.isActive !== undefined && { isActive: validation.data.isActive }),
      },
    });

    return secureResponse(request, NextResponse.json(updated));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'delete' });
    if (error) return error;

    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });
    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, guardrail.userId, 'Garde-fou');
    if (ownershipError) return ownershipError;

    await db.guardrail.delete({ where: { id } });

    await db.activityLog.create({
      data: { action: 'Garde-fou supprimé', details: JSON.stringify({ guardrailName: guardrail.name }), category: 'guardrail', userId: auth!.userId },
    });

    return secureResponse(request, NextResponse.json({ success: true }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
