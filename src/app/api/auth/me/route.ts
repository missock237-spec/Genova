// ============================================================
// GET /api/auth/me — Retourne l'utilisateur courant (mode-agnostic)
// ============================================================
// Détecte le type de cookie de session automatiquement :
//   1. Firebase session cookie → verify via Admin SDK
//   2. Standalone JWT → verify HMAC-SHA256
// ============================================================

import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';
import { cookies } from 'next/headers';
import {
  verifyJWT,
  getStandaloneServerSession,
  getUserById,
  isFirebaseConfigured,
} from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.json({ user: null });
    }

    // --- Tenter Firebase si configuré ---
    if (isFirebaseConfigured()) {
      try {
        const { getServerSession } = await import('@/lib/firebase/auth');
        const { db } = await import('@/lib/firebase/firestore');

        const session = await getServerSession();
        if (session) {
          let profile: any = null;
          let creditBalance = 0;

          try {
            profile = await db.user.findUnique({ where: { id: session.user.id } });
          } catch (e) {
            console.error('[auth/me] Profile fetch failed (non-fatal):', e);
          }

          try {
            const credit = await db.credit.findUnique({ where: { id: `credit_${session.user.id}` } });
            creditBalance = credit?.balance ?? profile?.credits ?? 0;
          } catch {}

          return NextResponse.json({
            user: {
              id: session.user.id,
              uid: session.user.uid,
              email: session.user.email,
              name: profile?.name || session.user.name,
              picture: session.user.picture || profile?.avatar,
              avatar: profile?.avatar,
              bio: profile?.bio,
              emailVerified: session.user.emailVerified,
              role: profile?.role || session.user.role || 'user',
              plan: profile?.plan || 'free',
              credits: creditBalance,
              isActive: profile?.isActive ?? true,
              isCreator: profile?.isCreator ?? false,
              language: profile?.language || 'fr',
              timezone: profile?.timezone || 'Africa/Douala',
              createdAt: profile?.createdAt,
              lastActiveAt: profile?.lastActiveAt,
            },
          });
        }
      } catch (firebaseErr) {
        console.error('[auth/me] Firebase session check failed:', firebaseErr);
        // Fall through au standalone
      }
    }

    // --- Standalone JWT ---
    const standaloneSession = verifyJWT(sessionCookie);
    if (standaloneSession) {
      const user = getUserById(standaloneSession.userId);
      return NextResponse.json({
        user: {
          id: standaloneSession.userId,
          uid: standaloneSession.userId,
          email: standaloneSession.email,
          name: user?.name || standaloneSession.name,
          picture: standaloneSession.avatar,
          avatar: user?.avatar || standaloneSession.avatar,
          bio: (user as any)?.bio,
          emailVerified: standaloneSession.emailVerified,
          role: user?.role || standaloneSession.role || 'user',
          plan: user?.plan || 'free',
          credits: user?.credits ?? standaloneSession.credits ?? 0,
          isActive: user?.isActive ?? true,
          isCreator: user?.isCreator ?? false,
          language: (user as any)?.language || 'fr',
          timezone: (user as any)?.timezone || 'Africa/Douala',
          createdAt: user?.createdAt,
          lastActiveAt: user?.lastActiveAt,
        },
      });
    }

    // Cookie présent mais invalide dans les deux modes
    return NextResponse.json({ user: null });
  } catch (error) {
    console.error('[auth/me] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}