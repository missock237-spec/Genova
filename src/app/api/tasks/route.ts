import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    // Facade Firestore : where/orderBy en tableaux, limit au lieu de take.
    const tasks = await db.task.findMany({
      where: [{ field: 'userId', op: '==', value: auth.userId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 50,
    });
    return NextResponse.json(tasks);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const { title, description, priority, agentId, status } = await request.json();
    if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 });
    const task = await db.task.create({
      data: { title, description: description || '', priority: priority || 'medium', status: status || 'pending', agentId: agentId || null, userId: auth.userId },
    });
    return NextResponse.json(task, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
