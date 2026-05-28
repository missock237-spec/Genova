import { NextRequest, NextResponse } from 'next/server';
import { refreshSession, extractRefreshToken, refreshSessionCookie } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError) return secError;

  try {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken) {
      const res = NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 401 }
      );
      return secureResponse(res, request);
    }

    const result = await refreshSession(refreshToken);

    if (!result) {
      const res = NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
      return secureResponse(res, request);
    }

    const res = NextResponse.json({
      message: 'Session refreshed successfully',
    });
    refreshSessionCookie(res, result.token, result.refreshToken);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Session refresh failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
