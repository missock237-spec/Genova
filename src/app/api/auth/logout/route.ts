import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/session';

/**
 * POST /api/auth/logout
 * Invalidates the current session token
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        await deleteSession(token);
      }
    }

    return NextResponse.json({ success: true, message: 'Déconnexion réussie' });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la déconnexion' }, { status: 500 });
  }
}
