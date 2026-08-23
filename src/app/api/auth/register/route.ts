// ============================================================
// POST /api/auth/register — Inscription (mode-agnostic)
// ============================================================
// Supporte deux stratégies détectées dynamiquement :
//   1. idToken présent → Firebase verify + profil Firestore
//   2. email+password présents → Standalone auth
//
// Le mode est détecté depuis le payload, PAS depuis les env vars.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  createUser as standaloneCreateUser,
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

    // --- STRATÉGIE 1 : Firebase idToken ---
    if (idToken) {
      try {
        const { setSessionCookie, verifyIdToken } = await import('@/lib/firebase/auth');
        const { db } = await import('@/lib/firebase/firestore');
        const { createAuditLog } = await import('@/lib/firebase/analytics');

        // 1. Vérifie l'idToken côté serveur
        const user = await verifyIdToken(idToken);
        if (!user) {
          console.error('[auth/register] verifyIdToken returned null');
          return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
        }

        // 2. Crée le profil étendu Firestore
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

        // 3. Crée l'entrée crédits
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
            details: { email: user.email, method: 'firebase' },
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
      } catch (firebaseErr) {
        console.error('[auth/register] Firebase path failed:',
          firebaseErr instanceof Error ? firebaseErr.message : String(firebaseErr));
        if (!directEmail || !directPassword) {
          return NextResponse.json(
            { error: 'Erreur d\'inscription Firebase. Veuillez reessayer.' },
            { status: 503 },
          );
        }
        // Fall through au standalone
      }
    }

    // --- STRATÉGIE 2 : Standalone email/password ---
    if (directEmail && directPassword) {
      const pwCheck = validatePasswordStrength(directPassword);
      if (!pwCheck.valid) {
        return NextResponse.json(
          { error: 'Mot de passe trop faible. ' + pwCheck.reasons.join(', ') },
          { status: 400 },
        );
      }

      const fallbackName = name || directEmail.split('@')[0] || 'Utilisateur';

      try {
        const { user, token } = standaloneCreateUser({
          email: directEmail,
          password: directPassword,
          name: fallbackName,
        });

        await setStandaloneSessionCookie(token);

        console.log('[auth/register] Standalone user created:', user.email, 'id:', user.id);

        return NextResponse.json({
          user: {
            id: user.id, uid: user.id, email: user.email, name: user.name,
            avatar: user.avatar, picture: user.avatar,
            emailVerified: user.emailVerified, isEmailVerified: user.emailVerified,
            role: user.role, plan: user.plan, credits: user.credits,
            isActive: user.isActive, isCreator: user.isCreator,
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

    // --- AUCUNE STRATÉGIE VALIDE ---
    return NextResponse.json(
      { error: 'Identifiants requis. Envoyez un idToken Firebase ou email+password+name.' },
      { status: 400 },
    );
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