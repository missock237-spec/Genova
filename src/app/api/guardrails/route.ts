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

    const guardrails = await db.guardrail.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return secureResponse(NextResponse.json(guardrails), request);
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
    const { name, type, description, rules, severity } = body;
    const userId = auth.userId;

    if (!name || !type) {
      return secureResponse(
        NextResponse.json({ error: 'Nom et type requis' }, { status: 400 }),
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

    // Validate guardrail type
    const VALID_TYPES = ['content_filter', 'rate_limit', 'permission', 'custom'];
    if (!VALID_TYPES.includes(type)) {
      return secureResponse(
        NextResponse.json({ error: `Type invalide. Valeurs autorisées: ${VALID_TYPES.join(', ')}` }, { status: 400 }),
        request
      );
    }

    // Validate severity
    const VALID_SEVERITIES = ['info', 'warning', 'critical', 'blocking'];
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return secureResponse(
        NextResponse.json({ error: `Sévérité invalide. Valeurs autorisées: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 }),
        request
      );
    }

    const guardrail = await db.guardrail.create({
      data: {
        name,
        type,
        description: description || '',
        rules: rules ? JSON.stringify(rules) : '{}',
        severity: severity || 'warning',
        userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Garde-fou créé',
        details: JSON.stringify({ guardrailName: name, type }),
        category: 'guardrail',
        userId,
      },
    });

    return secureResponse(NextResponse.json(guardrail, { status: 201 }), request);
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 }),
      request
    );
  }
}
