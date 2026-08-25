import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { prisma } from '@/lib/prisma';

export const dynamic = "force-dynamic";

/**
 * Authentifie de façon mode-agnostique (cookie session Firebase OU JWT
 * standalone, Bearer, X-API-Key) via applySecurity(). L'ancien code utilisait
 * getServerSession() de @/lib/auth (ré-export Firebase UNIQUEMENT) : en mode
 * standalone le cookie gen3ia_session est un JWT HS256 qui échouait la vérif
 * Firebase-only → 401 → les projets de code du visualiseur étaient inaccessibles.
 */
async function requireUser(request: NextRequest): Promise<{ userId: string; ok: true } | { ok: false; res: NextResponse }> {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error) return { ok: false, res: error };
  if (!auth?.userId) return { ok: false, res: NextResponse.json({ error: 'Non authentifie' }, { status: 401 }) };
  return { ok: true, userId: auth.userId };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;
    const userId = auth.userId;

    const projects = await prisma.codeProject.findMany({
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: [{ field: 'updatedAt', direction: 'desc' }],
      select: ['id', 'name', 'language', 'fileCount', 'updatedAt', 'createdAt'],
      take: 50,
    });

    return NextResponse.json({ projects });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;
    const userId = auth.userId;

    const { name, language, files } = await request.json().catch(() => ({}));
    if (!name || !language) {
      return NextResponse.json({ error: 'Nom et langage requis' }, { status: 400 });
    }

    const project = await prisma.codeProject.create({
      data: {
        name,
        language,
        userId,
        fileCount: files?.length || 1,
        files: JSON.stringify(files || [{ name: 'main.' + language, content: '', language }]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ project, message: 'Projet cree' }, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;
    const userId = auth.userId;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    // findUnique traite l'id comme clé de document (les docs n'ont pas de
    // champ id en données).
    const project = await prisma.codeProject.findUnique({ where: { id } }) as Record<string, unknown> | null;
    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: 'Projet non trouve' }, { status: 404 });
    }

    await prisma.codeProject.delete({ where: { id } });
    return NextResponse.json({ message: 'Projet supprime' });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.res;
    const userId = auth.userId;

    const { id, name, files } = await request.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const project = await prisma.codeProject.findUnique({ where: { id } }) as Record<string, unknown> | null;
    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: 'Projet non trouve' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (files) {
      updateData.files = JSON.stringify(files);
      updateData.fileCount = files.length;
    }
    updateData.updatedAt = new Date().toISOString();

    const updated = await prisma.codeProject.update({ where: { id }, data: updateData });
    return NextResponse.json({ project: updated });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
