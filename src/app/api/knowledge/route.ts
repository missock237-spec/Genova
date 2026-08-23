import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';

export const dynamic = "force-dynamic";
export async function GET(r: NextRequest) {
  const { auth, error } = await applySecurity(r, { requireAuth: true });
  if (error) return error;
  try {
    const k = await db.knowledge.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(k);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  const { auth, error } = await applySecurity(r, { requireAuth: true });
  if (error) return error;
  try {
    const b = await r.json();
    const { content, category } = b;
    if (!content) return NextResponse.json({ error: 'content requis' }, { status: 400 });
    const k = await db.knowledge.create({ data: { content, category: category || 'general', userId: auth.userId } });
    return NextResponse.json(k, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
