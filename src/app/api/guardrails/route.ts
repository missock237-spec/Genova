import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }

    const guardrails = await db.guardrail.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(guardrails);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, description, rules, severity, userId } = body;

    if (!name || !type || !userId) {
      return NextResponse.json({ error: 'Nom, type et userId requis' }, { status: 400 });
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

    return NextResponse.json(guardrail, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
