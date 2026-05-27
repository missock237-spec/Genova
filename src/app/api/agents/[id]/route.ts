import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, verifyOwnership, secureResponse } from '@/lib/security';
import { validateBody, updateAgentSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'read' });
    if (error) return error;

    const { id } = await params;
    const agent = await db.agent.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, agent.userId, 'Agent');
    if (ownershipError) return ownershipError;

    return secureResponse(request, NextResponse.json(agent));
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
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, agent.userId, 'Agent');
    if (ownershipError) return ownershipError;

    const body = await request.json();
    const validation = validateBody(updateAgentSchema, body);
    if (!validation.success) return validation.error;

    const updated = await db.agent.update({
      where: { id },
      data: {
        ...(validation.data.name && { name: validation.data.name }),
        ...(validation.data.type && { type: validation.data.type }),
        ...(validation.data.description !== undefined && { description: validation.data.description }),
        ...(validation.data.config && { config: JSON.stringify(validation.data.config) }),
        ...(validation.data.avatar !== undefined && { avatar: validation.data.avatar }),
        ...(validation.data.status && { status: validation.data.status }),
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
    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent) {
      return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    }

    const ownershipError = verifyOwnership(auth!.userId, agent.userId, 'Agent');
    if (ownershipError) return ownershipError;

    await db.agent.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Agent supprimé',
        details: JSON.stringify({ agentName: agent.name }),
        category: 'agent',
        userId: auth!.userId,
      },
    });

    return secureResponse(request, NextResponse.json({ success: true }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 });
  }
}
