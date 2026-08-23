// ============================================================
// POST /api/auth/change-password — Changer le mot de passe
// Supporte Firebase et Standalone
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  isFirebaseConfigured,
  validatePasswordStrength as standalonePwCheck,
  hashPassword,
  getUserById,
} from '@/lib/standalone-auth';
import { readFileSync, writeFileSync } from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_FILE = '/tmp/gen3ia-auth/users.json';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const newPassword = body?.newPassword as string | undefined;

    if (!newPassword) {
      return NextResponse.json({ error: 'newPassword requis' }, { status: 400 });
    }

    // Mode standalone
    if (!isFirebaseConfigured()) {
      const strength = standalonePwCheck(newPassword);
      if (!strength.valid) {
        return NextResponse.json(
          { error: 'Mot de passe trop faible', reasons: strength.reasons },
          { status: 400 },
        );
      }

      // Identifier l'utilisateur depuis la session
      const { getServerSession } = await import('@/lib/security');
      const session = await getServerSession();
      if (!session) {
        return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
      }

      const user = getUserById(session.user.id);
      if (!user) {
        return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
      }

      // Mettre a jour le mot de passe dans le store
      const { hash, salt } = hashPassword(newPassword);
      const store = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
      store.users[session.user.id].passwordHash = hash;
      store.users[session.user.id].salt = salt;
      store.users[session.user.id].updatedAt = new Date().toISOString();
      writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');

      console.log('[auth/change-password] Standalone: password updated for', user.email);
      return NextResponse.json({ success: true });
    }

    // Mode Firebase
    const idToken = body?.idToken as string | undefined;
    if (!idToken) {
      return NextResponse.json({ error: 'idToken requis' }, { status: 400 });
    }

    const { verifyIdToken, validatePasswordStrength } = await import('@/lib/firebase/auth');
    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json(
        { error: 'Mot de passe trop faible', reasons: strength.reasons },
        { status: 400 },
      );
    }

    const user = await verifyIdToken(idToken);
    if (!user) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
    }

    const auth = getAdminAuth();
    await auth.updateUser(user.uid, { password: newPassword });
    await auth.revokeRefreshTokens(user.uid);

    try {
      await createAuditLog({
        userId: user.uid, action: 'auth.password.changed',
        resource: 'auth', severity: 'info',
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[auth/change-password] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur lors du changement de mot de passe' },
      { status: 500 },
    );
  }
}