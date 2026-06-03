/**
 * GENOVA AI OS — POST /api/auth/refresh
 * Refreshes session tokens using the refresh token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshSession, extractRefreshToken, refreshSessionCookie } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimit(`refresh:${ip}`, { max: 20, windowMs: 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 401 }
      );
    }

    const result = await refreshSession(refreshToken);

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      message: 'Session refreshed successfully',
    });
    refreshSessionCookie(res, result.token, result.refreshToken);
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Session refresh failed' },
      { status: 500 }
    );
  }
}
