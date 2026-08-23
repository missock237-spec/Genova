// ============================================================
// POST /api/auth/reset-password — Confirmation reset
// Supporte Firebase et Standalone
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseConfigured, validatePasswordStrength as standalonePwCheck } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const newPassword = body?.newPassword as string | undefined;

    if (!newPassword) {
      return NextResponse.json({ error: 'newPassword requis' }, { status: 400 });
    }

    if (!isFirebaseConfigured()) {
      const strength = standalonePwCheck(newPassword);
      if (!strength.valid) {
        return NextResponse.json({ error: 'Mot de passe trop faible', reasons: strength.reasons }, { status: 400 });
      }
      // En mode standalone, le reset par email n'est pas supporte.
      // L'utilisateur doit contacter l'admin.
      return NextResponse.json({
        error: 'La reinitialisation par email n\'est pas disponible en mode standalone. Contactez l\'administrateur.',
      }, { status: 501 });
    }

    // Mode Firebase
    const oobCode = body?.oobCode as string | undefined;
    if (!oobCode) {
      return NextResponse.json({ error: 'oobCode requis' }, { status: 400 });
    }

    const { validatePasswordStrength } = await import('@/lib/firebase/auth');
    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: 'Mot de passe trop faible', reasons: strength.reasons }, { status: 400 });
    }

    const email = body?.email as string | undefined;
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const user = await auth.getUserByEmail(email.toLowerCase().trim());
    await auth.updateUser(user.uid, { password: newPassword });
    await auth.revokeRefreshTokens(user.uid);

    try {
      await createAuditLog({
        userId: user.uid, action: 'auth.password.reset.completed',
        resource: 'auth', severity: 'info',
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/reset-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors de la reinitialisation' },
      { status: 500 },
    );
  }
}