import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({
      where: { id },
      include: { validations: { take: 20, orderBy: { createdAt: 'desc' } } },
    });

    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
    }

    return NextResponse.json(guardrail);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

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

    return NextResponse.json(guardrail);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guardrail = await db.guardrail.findUnique({ where: { id } });

    if (!guardrail) {
      return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
