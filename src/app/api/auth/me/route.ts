import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

/**
 * GET /api/auth/me
 * FIX: Original accepted userId from query params — anyone could fetch any user's profile.
 * Now uses Bearer token to identify the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const { auth, error } = await applySecurity(request, { rateLimitCategory: 'auth' });
    if (error) return error;

    const user = await db.user.findUnique({
      where: { id: auth!.userId },
      select: { id: true, email: true, name: true, plan: true, avatar: true, createdAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    return secureResponse(request, NextResponse.json(user));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
