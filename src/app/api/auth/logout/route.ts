/**
 * GENOVA AI OS — POST /api/auth/logout
 * Destroys current session and clears cookies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractToken, extractRefreshToken, deleteSession, deleteSessionByRefreshToken, clearSessionCookie, destroySession } from '@/lib/session';
import { db } from '@/lib/db';

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const res = NextResponse.json({ success: true });
    clearSessionCookie(res);
    return res;
  } catch {
    const res = NextResponse.json({ error: 'Logout failed' }, { status: 500 });
    return res;
  }
}
