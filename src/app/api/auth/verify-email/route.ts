// ============================================================
// POST /api/auth/verify-email — Verification email
// Supporte Firebase et Standalone
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseConfigured } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const uid = body?.uid as string | undefined;

    if (!isFirebaseConfigured()) {
      // En mode standalone, la verification email n'est pas disponible.
      return NextResponse.json({
        success: true,
        message: 'Verification email automatique en mode standalone.',
      });
    }

    const oobCode = body?.oobCode as string | undefined;
    if (!oobCode || !uid) {
      return NextResponse.json({ error: 'oobCode et uid requis' }, { status: 400 });
    }

    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const { db } = await import('@/lib/firebase/firestore');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    await getAdminAuth().updateUser(uid, { emailVerified: true });
    await db.user.update({
      where: { id: uid },
      data: { emailVerified: true, updatedAt: new Date() },
    });

    await createAuditLog({
      userId: uid, action: 'auth.email.verified',
      resource: 'auth', severity: 'info',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/verify-email] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
