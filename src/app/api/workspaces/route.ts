import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";
export async function GET(r: NextRequest) {
  const { auth, error } = await applySecurity(r, { requireAuth: true });
  if (error) return error;
  try {
    const memberships = await db.workspaceMember.findMany({ where: { userId: auth.userId }, include: { workspace: true } });
    return NextResponse.json(memberships.map(m => ({ ...m.workspace, role: m.role, memberId: m.id })));
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  const { auth, error } = await applySecurity(r, { requireAuth: true });
  if (error) return error;
  try {
    const b = await r.json();
    const { name, slug, description } = b;
    if (!name || !slug) return NextResponse.json({ error: 'name et slug requis' }, { status: 400 });
    const w = await db.workspace.create({ data: { name, slug, description } });
    await db.workspaceMember.create({ data: { workspaceId: w.id, userId: auth.userId, role: 'owner' } });
    return NextResponse.json(w, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
