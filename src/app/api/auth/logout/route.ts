// ============================================================
// POST /api/auth/logout — Authentication
// ============================================================
// Supporte deux modes : Firebase et Standalone
// ============================================================

import { NextResponse } from 'next/server';
import { isFirebaseConfigured, clearStandaloneSessionCookie } from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // --- MODE STANDALONE ---
    if (!isFirebaseConfigured()) {
      await clearStandaloneSessionCookie();
      return NextResponse.json({ success: true });
    }

    // --- MODE FIREBASE ---
    const { clearSessionCookie, getSessionCookie, getServerSession } = await import('@/lib/firebase/auth');
    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    const session = await getServerSession();
    const cookieValue = await getSessionCookie();

    if (session && cookieValue) {
      try {
        const decoded = await getAdminAuth().verifySessionCookie(cookieValue, false);
        await getAdminAuth().revokeRefreshTokens(decoded.uid);
        await createAuditLog({
          userId: session.user.id,
          action: 'user.logout',
          resource: 'auth',
          severity: 'info',
        });
      } catch {
        // Non bloquant
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/logout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}
