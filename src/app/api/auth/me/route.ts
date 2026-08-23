// ============================================================
// GET /api/auth/me — Retourne l'utilisateur courant
// ============================================================
// Supporte deux modes : Firebase et Standalone
// ============================================================

import { NextResponse } from 'next/server';
import {
  isFirebaseConfigured,
  getStandaloneServerSession,
  getUserById,
} from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // --- MODE STANDALONE ---
    if (!isFirebaseConfigured()) {
      const session = await getStandaloneServerSession();
      if (!session) {
        return NextResponse.json({ user: null });
      }

      const user = getUserById(session.user.id);
      return NextResponse.json({
        user: {
          id: session.user.id,
          uid: session.user.uid,
          email: session.user.email,
          name: user?.name || session.user.name,
          picture: session.user.picture,
          avatar: user?.avatar || session.user.picture,
          bio: (user as any)?.bio,
          emailVerified: session.user.emailVerified,
          role: user?.role || session.user.role || 'user',
          plan: user?.plan || 'free',
          credits: user?.credits ?? 0,
          isActive: user?.isActive ?? true,
          isCreator: user?.isCreator ?? false,
          language: (user as any)?.language || 'fr',
          timezone: (user as any)?.timezone || 'Africa/Douala',
          createdAt: user?.createdAt,
          lastActiveAt: user?.lastActiveAt,
        },
      });
    }

    // --- MODE FIREBASE ---
    const { getServerSession } = await import('@/lib/firebase/auth');
    const { db } = await import('@/lib/firebase/firestore');

    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

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
  } catch (error) {
    console.error('[auth/me] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur' },
      { status: 500 },
    );
  }
}