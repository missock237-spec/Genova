// ============================================================
// POST /api/auth/register — Authentication
// ============================================================
// Supporte deux modes :
//   1. Firebase : { idToken, name } (mode par defaut)
//   2. Standalone : { email, password, name } (fallback sans Firebase)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  isFirebaseConfigured,
  createUser,
  setStandaloneSessionCookie,
  validatePasswordStrength,
} from '@/lib/standalone-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = body?.idToken as string | undefined;
    const directEmail = body?.email as string | undefined;
    const directPassword = body?.password as string | undefined;
    const name = body?.name as string | undefined;

    // --- MODE STANDALONE (sans Firebase) ---
    if (!isFirebaseConfigured()) {
      // Accepte soit { email, password, name } soit { idToken } (mais idToken ne marchera pas)
      if (!directEmail || !directPassword) {
        return NextResponse.json(
          { error: 'Email et mot de passe requis.' },
          { status: 400 },
        );
      }

      // Validation du mot de passe
      const pwCheck = validatePasswordStrength(directPassword);
      if (!pwCheck.valid) {
        return NextResponse.json(
          { error: 'Mot de passe trop faible. ' + pwCheck.reasons.join(', ') },
          { status: 400 },
        );
      }

      const fallbackName = name || directEmail.split('@')[0] || 'Utilisateur';

      try {
        const { user, token } = createUser({
          email: directEmail,
          password: directPassword,
          name: fallbackName,
        });

        await setStandaloneSessionCookie(token);

        console.log('[auth/register] Standalone user created:', user.email, 'id:', user.id);

        return NextResponse.json({
          user: {
            id: user.id,
            uid: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            picture: user.avatar,
            emailVerified: user.emailVerified,
            isEmailVerified: user.emailVerified,
            role: user.role,
            plan: user.plan,
            credits: user.credits,
            isActive: user.isActive,
            isCreator: user.isCreator,
          },
        });
      } catch (err: any) {
        const status = err?.status || 500;
        return NextResponse.json(
          { error: err?.message || "Erreur lors de l'inscription" },
          { status },
        );
      }
    }

    // --- MODE FIREBASE (configuration presente) ---
    if (!idToken) {
      return NextResponse.json({ error: 'idToken manquant' }, { status: 400 });
    }

    // Firebase path — dynamic import pour ne pas crasher si firebase-admin n'est pas configure
    const { setSessionCookie, verifyIdToken } = await import('@/lib/firebase/auth');
    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const { db } = await import('@/lib/firebase/firestore');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    // 1. Verifie l'idToken cote serveur (Admin SDK).
    const user = await verifyIdToken(idToken);
    if (!user) {
      console.error('[auth/register] verifyIdToken returned null');
      return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
    }

    // 2. Cree le profil etendu Firestore
    const now = new Date();
    const fallbackName = name || user.displayName || user.email?.split('@')[0] || 'Utilisateur';
    try {
      await db.user.upsert({
        where: { id: user.uid },
        create: {
          id: user.uid, uid: user.uid,
          email: user.email || (body?.email as string) || '',
          name: fallbackName, avatar: user.photoURL || null,
          emailVerified: user.emailVerified, plan: 'free', role: 'user',
          credits: 100, isActive: true, isCreator: false,
          creatorEarnings: 0, creatorWithdrawn: 0,
          createdAt: now, updatedAt: now, lastActiveAt: now,
        },
        update: {
          name: name || user.displayName || undefined,
          avatar: user.photoURL || undefined,
          emailVerified: user.emailVerified,
          lastActiveAt: now, updatedAt: now,
        },
      });
    } catch (profileErr) {
      console.error('[auth/register] Firestore profile creation FAILED:', profileErr);
      await rollbackFirebaseUser(user.uid);
      return NextResponse.json(
        { error: 'Erreur lors de la creation du profil. Reessayez.' },
        { status: 500 },
      );
    }

    // 3. Cree l'entree credits
    try {
      const existingCredit = await db.credit.findUnique({ where: { id: `credit_${user.uid}` } });
      if (!existingCredit) {
        await db.credit.createWithId(`credit_${user.uid}`, {
          id: `credit_${user.uid}`, userId: user.uid,
          balance: 100, totalEarned: 100, totalSpent: 0,
          currency: 'credits', createdAt: now, updatedAt: now,
        });
      }
    } catch (creditErr) {
      console.error('[auth/register] Credit creation FAILED:', creditErr);
      try { await db.user.delete({ where: { id: user.uid } }); } catch {}
      await rollbackFirebaseUser(user.uid);
      return NextResponse.json(
        { error: "Erreur lors de l'initialisation des credits. Reessayez." },
        { status: 500 },
      );
    }

    // 4. Positionne le cookie de session
    try {
      await setSessionCookie(idToken);
    } catch (cookieErr) {
      const msg = cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      console.error('[auth/register] setSessionCookie failed:', msg);
      return NextResponse.json(
        { error: 'Erreur de session. Rechargez la page et connectez-vous.' },
        { status: 503 },
      );
    }

    // 5. Audit log (non bloquant)
    try {
      await createAuditLog({
        userId: user.uid, action: 'user.register', resource: 'auth',
        details: { email: user.email, method: user.providerData?.[0]?.providerId || 'password' },
        severity: 'info',
      });
    } catch {}

    return NextResponse.json({
      user: {
        id: user.uid, uid: user.uid, email: user.email || '', name: fallbackName,
        avatar: user.photoURL || null, picture: user.photoURL || null,
        emailVerified: user.emailVerified, isEmailVerified: user.emailVerified,
        role: 'user', plan: 'free', credits: 100, isActive: true, isCreator: false,
      },
    });
  } catch (error) {
    console.error('[auth/register] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de l'inscription" },
      { status: 500 },
    );
  }
}

async function rollbackFirebaseUser(uid: string): Promise<void> {
  try {
    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const auth = getAdminAuth();
    await auth.deleteUser(uid);
    console.warn('[auth/register] ROLLBACK: deleted Firebase user', uid);
  } catch (deleteErr) {
    console.error('[auth/register] ROLLBACK FAILED:', uid, deleteErr);
  }
}

export async function GET() {
  return NextResponse.json({
    passwordPolicy: {
      min: 8,
      rules: ['Au moins 8 caracteres', 'Au moins une majuscule', 'Au moins une minuscule', 'Au moins un chiffre'],
    },
  });
}