/**
 * GENOVA AI OS — Session Manager
 * Matches existing architecture:
 *   - httpOnly cookies
 *   - Max 10 sessions per user (oldest evicted)
 *   - Session TTL: 24h  |  Refresh token TTL: 7 days
 *   - All operations logged in AuditLog
 *   - rememberMe support
 *   - getCurrentSession reads from cookies()
 */

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAuditLog } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { generateSessionToken } from '@/lib/auth';

const log = createLogger('session');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;       // 24 h
export const REFRESH_TTL_MS = 7  * 24 * 60 * 60 * 1000;  // 7 days
export const MAX_SESSIONS_PER_USER = 10;
const SESSION_COOKIE = 'genova_session';
const REFRESH_COOKIE = 'genova_refresh';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  sessionId: string;
}

interface CreateSessionOptions {
  ipAddress?: string | null;
  userAgent?: string | null;
  rememberMe?: boolean;
}

// ─── CREATE SESSION ───────────────────────────────────────────────────────────

export async function createSession(
  userId: string,
  options: CreateSessionOptions = {}
): Promise<{ token: string; refreshToken: string }> {
  const token = generateSessionToken();
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const rememberMe = options.rememberMe ?? false;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  // Session hardening: Enforce max sessions per user
  const activeSessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastAccessedAt: 'asc' },
    select: { id: true },
  });

  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    const sessionsToRemove = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER + 1);
    const idsToRemove = sessionsToRemove.map(s => s.id);

    await db.session.deleteMany({
      where: { id: { in: idsToRemove } },
    }).catch(() => {});

    log.info('Evicted oldest sessions for user', {
      userId,
      evictedCount: idsToRemove.length,
    });

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
      rememberMe,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  });

  await createAuditLog({
    userId,
    action: 'session_create',
    resource: 'session',
    details: { expiresAt: expiresAt.toISOString(), rememberMe },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    severity: 'info',
  });

  return { token, refreshToken };
}

// ─── VALIDATE SESSION ────────────────────────────────────────────────────────

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

// ─── REFRESH SESSION ─────────────────────────────────────────────────────────

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

  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const newToken = generateSessionToken();
  const newRefreshToken = crypto.randomBytes(48).toString('hex');
  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

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

  await createAuditLog({
    userId: session.userId,
    action: 'session_refresh',
    resource: 'session',
    resourceId: session.id,
    severity: 'info',
  });

  return { token: newToken, refreshToken: newRefreshToken };
}

// ─── GET CURRENT SESSION (from cookies) ──────────────────────────────────────

export async function getCurrentSession(): Promise<SessionPayload | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const session = await db.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, name: true, role: true, isActive: true, isEmailVerified: true } } },
    });

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    if (!session.user.isActive) return null;

    // Update last accessed timestamp
    await db.session.update({
      where: { token },
      data: { lastAccessedAt: new Date() },
    }).catch(() => {});

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      isActive: session.user.isActive,
      isEmailVerified: session.user.isEmailVerified,
      sessionId: session.id,
    };
  } catch {
    return null;
  }
}

// ─── DESTROY SESSION ─────────────────────────────────────────────────────────

export async function destroySession(request: Request): Promise<void> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return;

    const session = await db.session.findUnique({ where: { token }, select: { id: true, userId: true } });

    if (session) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      await db.session.delete({ where: { id: session.id } }).catch(() => {});
      await createAuditLog({
        userId: session.userId,
        action: 'logout',
        resource: 'session',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') ?? 'unknown',
      });
    }
  } catch {
    // Silently fail
  }
}

// ─── TOKEN EXTRACTION ────────────────────────────────────────────────────────

export function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export function extractRefreshToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (cookieToken) return cookieToken;

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

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return { userId, role: user?.role || 'user' };
}

// ─── COOKIE HELPERS ──────────────────────────────────────────────────────────

export function setSessionCookie(response: NextResponse, token: string, rememberMe: boolean = false): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: rememberMe ? SESSION_TTL_MS / 1000 : undefined, // session cookie if not remember
    path: '/',
  });
}

export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: REFRESH_TTL_MS / 1000,
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

  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

// ─── SESSION DELETION ────────────────────────────────────────────────────────

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
    }, 60 * 60 * 1000);
  }
}

export { SESSION_COOKIE as COOKIE_NAME, REFRESH_COOKIE as REFRESH_COOKIE_NAME };
