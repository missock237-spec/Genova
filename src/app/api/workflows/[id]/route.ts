import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const workflow = await db.workflow.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    return NextResponse.json(workflow);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const body = await request.json();
    const workflow = await db.workflow.updateMany({
      where: { id: (await params).id, userId: auth.userId },
      data: { ...body, updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, updated: workflow.count });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    await db.workflow.deleteMany({
      where: { id: (await params).id, userId: auth.userId },
    });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return error;
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'execute';

    const workflow = await db.workflow.findFirst({
      where: { id: (await params).id, userId: auth.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });

    if (action === 'execute') {
      const updated = await db.workflow.update({
        where: { id: (await params).id },
        data: { status: 'active', updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, status: 'active', workflow: updated });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
