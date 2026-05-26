import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await db.task.findUnique({
      where: { id },
      include: {
        agent: true,
        workflow: true,
        validations: { include: { guardrail: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
