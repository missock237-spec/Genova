import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        tasks: { orderBy: { createdAt: 'desc' }, take: 10 },
        permissions: true,
      },
    });

    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    const res = NextResponse.json(agent);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const agent = await db.agent.findUnique({ where: { id } });
    if (!agent || agent.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Validate status field if provided
    if (body.status && !['active', 'inactive'].includes(body.status)) {
      const res = NextResponse.json(
        { error: 'Invalid status. Allowed values: active, inactive' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (body.name && body.name.length > 100) {
      const res = NextResponse.json(
        { error: 'Name must be at most 100 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (body.description && body.description.length > 1000) {
      const res = NextResponse.json(
        { error: 'Description must be at most 1000 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const updated = await db.agent.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.type && { type: body.type }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.config && { config: JSON.stringify(body.config) }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
        ...(body.status && { status: body.status }),
      },
    });

    const res = NextResponse.json(updated);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function DELETE(
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

    await db.agent.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Agent Deleted',
        details: JSON.stringify({ agentName: agent.name }),
        category: 'agent',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
