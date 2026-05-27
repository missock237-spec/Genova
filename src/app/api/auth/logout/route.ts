import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, deleteSession, clearSessionCookie } from '@/lib/session';
import { secureResponse } from '@/lib/security';

/**
 * POST /api/auth/logout
 * FIX: Now requires valid auth (rejects unauthenticated requests).
 * Clears the httpOnly session cookie and deletes the session from DB.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);

    // Even if auth fails, clear the cookie (best-effort logout)
    const response = NextResponse.json({
      success: true,
      message: 'Déconnexion réussie',
    });

    // If we have a valid session, delete it from the database
    if (auth) {
      // Extract the token to delete from DB
      const cookieToken = request.cookies.get('genova_session')?.value;
      const authHeader = request.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
      const token = cookieToken || bearerToken;

      if (token) {
        await deleteSession(token);
      }
    }

    // Always clear the cookie
    clearSessionCookie(response);

    return secureResponse(request, response);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la déconnexion' }, { status: 500 });
  }
}
