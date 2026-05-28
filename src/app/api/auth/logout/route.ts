import { NextRequest, NextResponse } from 'next/server';
import { extractToken, extractRefreshToken, deleteSession, deleteSessionByRefreshToken, clearSessionCookie } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    // Delete the session by session token
    const token = extractToken(request);
    if (token) {
      await deleteSession(token);
    }

    // Also delete by refresh token if present
    const refreshToken = extractRefreshToken(request);
    if (refreshToken) {
      await deleteSessionByRefreshToken(refreshToken);
    }

    await db.activityLog.create({
      data: {
        action: 'Logout',
        details: '{}',
        category: 'auth',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({ success: true });
    clearSessionCookie(res);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
