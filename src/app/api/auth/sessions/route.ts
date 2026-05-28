import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractToken } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

function maskUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  // Keep only the first part of the user agent (browser/OS info)
  // Truncate to prevent leaking full fingerprint data
  if (ua.length > 80) {
    return ua.substring(0, 77) + '...';
  }
  return ua;
}

function maskIpAddress(ip: string | null): string | null {
  if (!ip) return null;
  // For IPv4, mask the last octet
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  // For IPv6 or other formats, mask the last segment
  if (ip.includes(':')) {
    const segments = ip.split(':');
    segments[segments.length - 1] = 'xxxx';
    return segments.join(':');
  }
  // Fallback: return as-is if format is unexpected
  return ip;
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const sessions = await db.session.findMany({
      where: {
        userId: auth.userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        lastAccessedAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: { lastAccessedAt: 'desc' },
    });

    const currentToken = extractToken(request);

    const maskedSessions = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      ipAddress: maskIpAddress(session.ipAddress),
      userAgent: maskUserAgent(session.userAgent),
      current: false, // We'll identify current session separately
    }));

    // Find which session is the current one by checking the token
    // We do this separately to avoid exposing tokens in the response
    if (currentToken) {
      const currentSession = await db.session.findUnique({
        where: { token: currentToken },
        select: { id: true },
      });
      if (currentSession) {
        const idx = maskedSessions.findIndex((s) => s.id === currentSession.id);
        if (idx !== -1) {
          maskedSessions[idx].current = true;
        }
      }
    }

    const res = NextResponse.json({ sessions: maskedSessions });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function DELETE(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      const res = NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check if trying to delete current session
    const currentToken = extractToken(request);
    if (currentToken) {
      const currentSession = await db.session.findUnique({
        where: { token: currentToken },
        select: { id: true },
      });
      if (currentSession && currentSession.id === sessionId) {
        const res = NextResponse.json(
          { error: 'Cannot delete the current session. Use /api/auth/logout instead.' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    // Find the session and verify it belongs to this user
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session || session.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    // Delete the session (force logout from that device)
    await db.session.delete({
      where: { id: sessionId },
    });

    await db.activityLog.create({
      data: {
        action: 'Session Revoked',
        details: JSON.stringify({ sessionId }),
        category: 'auth',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({
      message: 'Session revoked successfully',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
