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

    const workflows = await db.workflow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });

    return secureResponse(NextResponse.json(workflows), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await request.json();
    const { name, description, steps, trigger } = body;
    const userId = auth.userId;

    if (!name) {
      return secureResponse(
        NextResponse.json({ error: 'Nom requis' }, { status: 400 }),
        request
      );
    }

    // Input length validation
    if (name.length > 100) {
      return secureResponse(
        NextResponse.json({ error: 'Name must be at most 100 characters' }, { status: 400 }),
        request
      );
    }

    if (description && description.length > 1000) {
      return secureResponse(
        NextResponse.json({ error: 'Description must be at most 1000 characters' }, { status: 400 }),
        request
      );
    }

    const workflow = await db.workflow.create({
      data: {
        name,
        description: description || '',
        steps: steps ? JSON.stringify(steps) : '[]',
        trigger: trigger ? JSON.stringify(trigger) : '{"type":"manual"}',
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Workflow créé',
        details: JSON.stringify({ workflowName: name }),
        category: 'workflow',
        userId,
      },
    });

    return secureResponse(NextResponse.json(workflow, { status: 201 }), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 }),
      request
    );
  }
}
