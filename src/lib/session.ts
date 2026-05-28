import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAuditLog } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('session');

const SESSION_DURATION_HOURS = 24;
const REFRESH_TOKEN_DURATION_HOURS = 168; // 7 days
const COOKIE_NAME = 'genova_session';
const REFRESH_COOKIE_NAME = 'genova_refresh';
const MAX_SESSIONS_PER_USER = 10; // Prevent session flooding

export function createRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

interface CreateSessionOptions {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<{ token: string; refreshToken: string }> {
  const token = crypto.randomBytes(48).toString('hex');
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_HOURS * 60 * 60 * 1000);

  // Session hardening: Enforce max sessions per user
  // If user has too many active sessions, revoke the oldest ones
  const activeSessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastAccessedAt: 'asc' },
    select: { id: true },
  });

  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    // Remove oldest sessions to make room
    const sessionsToRemove = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER + 1);
    const idsToRemove = sessionsToRemove.map(s => s.id);

    await db.session.deleteMany({
      where: { id: { in: idsToRemove } },
    }).catch(() => {});

    log.info('Evicted oldest sessions for user', {
      userId,
      evictedCount: idsToRemove.length,
      remainingActive: activeSessions.length - idsToRemove.length,
    });

    // Audit log for session eviction
    await createAuditLog({
      userId,
      action: 'session_evict',
      resource: 'session',
      details: { evictedCount: idsToRemove.length, reason: 'max_sessions_exceeded' },
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      severity: 'info',
    });
  }

  await db.session.create({
    data: {
      token,
      userId,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  });

  // Audit log for new session creation
  await createAuditLog({
    userId,
    action: 'session_create',
    resource: 'session',
    details: { expiresAt: expiresAt.toISOString() },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    severity: 'info',
  });

  return { token, refreshToken };
}

export async function validateSession(token: string): Promise<string | null> {
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token } }).catch(() => {});
    return null;
  }

  // Update last accessed timestamp (fire-and-forget)
  await db.session.update({
    where: { token },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  return session.userId;
}

export async function refreshSession(
  refreshToken: string
): Promise<{ token: string; refreshToken: string } | null> {
  if (!refreshToken) return null;

  const session = await db.session.findUnique({
    where: { refreshToken },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      refreshExpiresAt: true,
    },
  });

  if (!session) return null;

  // Check refresh token expiry
  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Create new tokens
  const newToken = crypto.randomBytes(48).toString('hex');
  const newRefreshToken = createRefreshToken();
  const newExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_HOURS * 60 * 60 * 1000);

  // Update the session with new tokens
  await db.session.update({
    where: { id: session.id },
    data: {
      token: newToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      refreshExpiresAt: newRefreshExpiresAt,
      lastAccessedAt: new Date(),
    },
  });

  // Audit log for session refresh
  await createAuditLog({
    userId: session.userId,
    action: 'session_refresh',
    resource: 'session',
    resourceId: session.id,
    severity: 'info',
  });

  return { token: newToken, refreshToken: newRefreshToken };
}

export function extractToken(request: NextRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  // Then check Authorization Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export function extractRefreshToken(request: NextRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  // Then check X-Refresh-Token header
  const headerToken = request.headers.get('x-refresh-token');
  if (headerToken) return headerToken;

  return null;
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string; role?: string } | null> {
  const token = extractToken(request);
  if (!token) return null;

  const userId = await validateSession(token);
  if (!userId) return null;

  // Fetch user role for RBAC
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return { userId, role: user?.role || 'user' };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_HOURS * 60 * 60,
    path: '/',
  });
}

export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: REFRESH_TOKEN_DURATION_HOURS * 60 * 60,
    path: '/',
  });
}

export function refreshSessionCookie(
  response: NextResponse,
  token: string,
  refreshToken: string
): void {
  setSessionCookie(response, token);
  setRefreshCookie(response, refreshToken);
}

export function clearSessionCookie(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  // Also clear refresh cookie
  response.cookies.set(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

export async function deleteSession(token: string): Promise<void> {
  const session = await db.session.findUnique({
    where: { token },
    select: { userId: true },
  });

  await db.session.delete({ where: { token } }).catch(() => {});

  if (session) {
    await createAuditLog({
      userId: session.userId,
      action: 'logout',
      resource: 'session',
      severity: 'info',
    });
  }
}

export async function deleteSessionByRefreshToken(refreshToken: string): Promise<void> {
  const session = await db.session.findUnique({
    where: { refreshToken },
    select: { userId: true },
  });

  await db.session.delete({ where: { refreshToken } }).catch(() => {});

  if (session) {
    await createAuditLog({
      userId: session.userId,
      action: 'session_revoke_refresh',
      resource: 'session',
      severity: 'info',
    });
  }
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const result = await db.session.deleteMany({ where: { userId } }).catch(() => {});

  await createAuditLog({
    userId,
    action: 'session_revoke_all',
    resource: 'session',
    details: { sessionsRevoked: result?.count || 0 },
    severity: 'warning',
  });
}

// Periodic cleanup of expired sessions (runs every hour)
if (typeof globalThis !== 'undefined') {
  const globalForCleanup = globalThis as unknown as { sessionCleanupInterval?: NodeJS.Timeout };
  if (!globalForCleanup.sessionCleanupInterval && process.env.NODE_ENV !== 'test') {
    globalForCleanup.sessionCleanupInterval = setInterval(async () => {
      try {
        const result = await db.session.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        if (result.count > 0) {
          log.info('Cleaned up expired sessions', { count: result.count });
        }
      } catch {
        // Silently fail - cleanup will retry next interval
      }
    }, 60 * 60 * 1000); // Every hour
  }
}

export { COOKIE_NAME, REFRESH_COOKIE_NAME, MAX_SESSIONS_PER_USER };
