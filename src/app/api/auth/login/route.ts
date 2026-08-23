// ============================================================
// POST /api/auth/login — Authentication
// ============================================================
// Supporte deux modes :
//   1. Firebase : { idToken, rememberMe } (mode par defaut)
//   2. Standalone : { email, password, rememberMe } (fallback sans Firebase)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  isFirebaseConfigured,
  authenticateUser,
  setStandaloneSessionCookie,
} from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const directEmail = body?.email as string | undefined;
    const directPassword = body?.password as string | undefined;
    const rememberMe = body?.rememberMe as boolean | undefined;

    // --- MODE STANDALONE (sans Firebase) ---
    if (!isFirebaseConfigured()) {
      if (!directEmail || !directPassword) {
        return NextResponse.json({ error: 'Email et mot de passe requis.' }, { status: 400 });
      }

      const result = authenticateUser(directEmail, directPassword);
      if (!result) {
        return NextResponse.json(
          { error: 'Identifiants invalides. Verifiez votre email et mot de passe.' },
          { status: 401 },
        );
      }

      await setStandaloneSessionCookie(result.token, rememberMe);

      console.log('[auth/login] Standalone login:', result.user.email, 'in', Date.now() - startTime, 'ms');

      return NextResponse.json({
        user: {
          id: result.user.id,
          uid: result.user.id,
          email: result.user.email,
          name: result.user.name,
          avatar: result.user.avatar,
          picture: result.user.avatar,
          emailVerified: result.user.emailVerified,
          isEmailVerified: result.user.emailVerified,
          role: result.user.role,
          plan: result.user.plan,
          credits: result.user.credits,
          isActive: result.user.isActive,
          isCreator: result.user.isCreator,
        },
      });
    }

    // --- MODE FIREBASE (configuration presente) ---
    if (!idToken) {
      console.warn('[auth/login] Missing idToken');
      return NextResponse.json({ error: 'idToken manquant' }, { status: 400 });
    }

    // Firebase path — dynamic import
    const { setSessionCookie, verifyIdToken } = await import('@/lib/firebase/auth');
    const { db } = await import('@/lib/firebase/firestore');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    // 1. Verification du token Firebase Admin
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/login] verifyIdToken returned null. Token length:', idToken?.length, 'Elapsed:', Date.now() - startTime, 'ms');
      return NextResponse.json(
        { error: 'Session invalide. Veuillez reessayer.' },
        { status: 401 },
      );
    }
    console.log('[auth/login] Token verified for:', user.email, 'uid:', user.uid, 'in', Date.now() - startTime, 'ms');

    // 2. Recuperation du profil Firestore
    const now = new Date();
    const fallbackName = user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    let profile: any = null;

    try {
      profile = await db.user.findUnique({ where: { id: user.uid } });
    } catch (profileErr) {
      console.error('[auth/login] profile fetch failed:', profileErr);
    }

    // 3. Auto-repair profile si absent
    if (!profile) {
      console.warn('[auth/login] No profile found for uid:', user.uid, '— auto-creating');
      try {
        await db.user.upsert({
          where: { id: user.uid },
          create: {
            id: user.uid, uid: user.uid, email: user.email || '',
            name: fallbackName, avatar: user.photoURL || null,
            emailVerified: user.emailVerified, plan: 'free',
            role: (user.customClaims?.role as string) || 'user',
            credits: 50, isActive: true, isCreator: false,
            creatorEarnings: 0, creatorWithdrawn: 0,
            createdAt: now, updatedAt: now, lastActiveAt: now,
          },
          update: {
            name: user.displayName || undefined, avatar: user.photoURL || undefined,
            emailVerified: user.emailVerified, lastActiveAt: now, updatedAt: now,
          },
        });
        profile = await db.user.findUnique({ where: { id: user.uid } });
      } catch (createErr) {
        console.error('[auth/login] auto-create profile failed:', createErr);
      }
      if (!profile) {
        return NextResponse.json(
          { error: 'Impossible de creer le profil utilisateur. Contactez le support.' },
          { status: 500 },
        );
      }
    }

    // 4. Verification du compte actif
    if (profile.isActive === false) {
      return NextResponse.json(
        { error: 'Ce compte a ete desactive. Contactez le support.' },
        { status: 403 },
      );
    }

    // 5. Cookie de session
    try {
      await setSessionCookie(idToken, rememberMe);
    } catch (cookieErr) {
      console.error('[auth/login] setSessionCookie failed:', cookieErr);
      return NextResponse.json(
        { error: 'Erreur de session. Veuillez reessayer.' },
        { status: 503 },
      );
    }

    // 6. Mise a jour profil (non bloquant)
    try {
      await db.user.update({
        where: { id: user.uid },
        data: {
          email: user.email || '', name: user.displayName || undefined,
          avatar: user.photoURL || undefined, emailVerified: user.emailVerified,
          lastActiveAt: now, updatedAt: now,
        },
      });
    } catch (updateErr) {
      console.error('[auth/login] Firestore update failed (non-fatal):', updateErr);
    }

    // 7. Audit log (non bloquant)
    try {
      await createAuditLog({
        userId: user.uid, action: 'user.login', resource: 'auth',
        details: { email: user.email, method: user.providerData?.[0]?.providerId || 'password', durationMs: Date.now() - startTime },
        severity: 'info',
      });
    } catch {}

    return NextResponse.json({
      user: {
        id: user.uid, uid: user.uid, email: user.email || '',
        name: profile.name || user.displayName || fallbackName,
        avatar: profile.avatar || user.photoURL || null,
        picture: user.photoURL || null, emailVerified: user.emailVerified,
        isEmailVerified: user.emailVerified,
        role: (user.customClaims?.role as string) || profile?.role || 'user',
        plan: profile?.plan || 'free', credits: profile?.credits ?? 0,
        isActive: profile?.isActive ?? true, isCreator: profile?.isCreator ?? false,
      },
    });
  } catch (error) {
    console.error('[auth/login] Error after', Date.now() - startTime, 'ms:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur d'authentification" },
      { status: 500 },
    );
  }
}
