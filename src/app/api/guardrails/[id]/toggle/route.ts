import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const guardrail = await db.guardrail.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });
    if (!guardrail) return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });

    const updated = await db.guardrail.update({
      where: { id: (await params).id },
      data: { isActive: !guardrail.isActive },
      select: { isActive: true },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
