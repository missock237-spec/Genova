// ============================================================
// GET / PATCH /api/auth/profile — Profil utilisateur
// Supporte Firebase et Standalone
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isFirebaseConfigured, getUserById } from '@/lib/standalone-auth';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATA_FILE = '/tmp/gen3ia-auth/users.json';

export async function GET() {
  try {
    const { getServerSession } = await import('@/lib/security');
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    if (!isFirebaseConfigured()) {
      const user = getUserById(session.user.id);
      if (!user) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
      const { passwordHash, salt, ...safeUser } = user;
      return NextResponse.json({ profile: safeUser });
    }

    const { db } = await import('@/lib/firebase/firestore');
    const profile = await db.user.findUnique({ where: { id: session.user.id } });
    if (!profile) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[auth/profile GET] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) { return PATCH(req); }

export async function PATCH(req: NextRequest) {
  try {
    const { getServerSession } = await import('@/lib/security');
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body invalide' }, { status: 400 });

    if (!isFirebaseConfigured()) {
      // Mode standalone : mise a jour directe dans le fichier JSON
      const allowedFields = ['name', 'avatar', 'bio', 'language', 'timezone'];
      const patch: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (field in body) patch[field] = body[field];
      }
      patch.updatedAt = new Date().toISOString();

      try {
        const store = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
        const user = store.users[session.user.id];
        if (!user) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
        Object.assign(user, patch);
        writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
        const { passwordHash, salt, ...safeUser } = user;
        return NextResponse.json({ profile: safeUser });
      } catch (err) {
        console.error('[auth/profile PATCH] Standalone error:', err);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
      }
    }

    // Mode Firebase
    const { updateUser } = await import('@/lib/firebase/auth');
    const { db } = await import('@/lib/firebase/firestore');
    const { createAuditLog } = await import('@/lib/firebase/analytics');

    const allowedFields = ['name', 'avatar', 'bio', 'preferences', 'language', 'timezone'];
    const patch: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) patch[field] = body[field];
    }
    patch.updatedAt = new Date();

    const updated = await db.user.update({ where: { id: session.user.id }, data: patch });

    if (body.name || body.avatar) {
      await updateUser(session.user.id, {
        ...(body.name ? { displayName: body.name } : {}),
        ...(body.avatar ? { photoURL: body.avatar } : {}),
      });
    }

    await createAuditLog({
      userId: session.user.id, action: 'user.profile.update',
      resource: 'profile', details: { fields: Object.keys(patch) }, severity: 'info',
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('[auth/profile PATCH] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 },
    );
  }
}