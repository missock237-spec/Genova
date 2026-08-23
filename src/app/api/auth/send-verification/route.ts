// ============================================================
// POST /api/auth/send-verification — Envoie l'email de verification
// Supporte Firebase et Standalone
// ============================================================

import { NextResponse } from 'next/server';
import { isFirebaseConfigured } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST() {
  try {
    const { getServerSession } = await import('@/lib/security');
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    if (!isFirebaseConfigured()) {
      return NextResponse.json({
        success: true,
        message: 'Verification email non disponible en mode standalone.',
      });
    }

    const { sendEmailVerificationLink } = await import('@/lib/firebase/auth');
    await sendEmailVerificationLink(session.user.id, {
      url: `${APP_URL}/dashboard`,
      handleCodeInApp: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/send-verification] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}