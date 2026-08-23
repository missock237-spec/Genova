// ============================================================
// POST /api/auth/forgot-password — Demande de reset
// ============================================================
// Supporte Firebase et Standalone.
// En mode standalone : repond OK (pas de reset par email sans config email).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseConfigured, getUserByEmail as getStandaloneUser } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = body?.email as string | undefined;
    if (!email) return NextResponse.json({ error: 'Email manquant' }, { status: 400 });

    if (!isFirebaseConfigured()) {
      // Mode standalone : on verifie juste que l'utilisateur existe (anti-enumeration)
      const user = getStandaloneUser(email);
      if (user) {
        console.log('[auth/forgot-password] Standalone: user exists for', email, '(no email service configured)');
      }
      return NextResponse.json({
        success: true,
        message: 'Si cet email existe, un lien de reinitialisation a ete envoye.',
      });
    }

    // Mode Firebase
    const { sendPasswordResetEmail, getUserByEmail } = await import('@/lib/firebase/auth');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    const user = await getUserByEmail(email);
    if (user) {
      await sendPasswordResetEmail(email, {
        url: `${APP_URL}/reset-password`,
        handleCodeInApp: true,
      });
      await createAuditLog({
        userId: user.uid, action: 'auth.password.reset.requested',
        resource: 'auth', severity: 'info',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Si cet email existe, un lien de reinitialisation a ete envoye.',
    });
  } catch (error) {
    console.error('[auth/forgot-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
