// Session Management — Secure httpOnly cookie-based API authorization
// FIX: Token moved from Bearer header to httpOnly cookie for XSS protection.
// The session token is never accessible via JavaScript (httpOnly + Secure + SameSite=Strict).
// Both cookie and Bearer header are supported for backward compatibility.

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_DURATION_HOURS = 24;
const COOKIE_NAME = 'genova_session';

/**
 * Generate a cryptographically secure session token
 */
function generateToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create a new session for a user after successful authentication
 * Returns the session token (to be set as httpOnly cookie)
 */
export async function createSession(userId: string): Promise<string> {
  // Clean up expired sessions for this user first
  await db.session.deleteMany({
    where: {
      userId,
      expiresAt: { lt: new Date() },
    },
  });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validate a session token and return the authenticated user ID
 * Returns null if the token is invalid, expired, or missing
 */
export async function validateSession(token: string): Promise<string | null> {
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!session) return null;

  // Check expiration
  if (new Date() > session.expiresAt) {
    // Delete expired session
    await db.session.delete({ where: { token } }).catch(() => {});
    return null;
  }

  return session.userId;
}

/**
 * Extract session token from httpOnly cookie (primary) or Bearer header (fallback)
 */
function extractToken(request: NextRequest): string | null {
  // 1. Try httpOnly cookie first (secure method)
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  // 2. Fallback: Bearer token in Authorization header (backward compat)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) return bearerToken;
  }

  return null;
}

/**
 * Extract and validate the authenticated user from a Next.js API request
 * Checks httpOnly cookie first, then falls back to Bearer token
 *
 * Usage in API routes:
 * ```ts
 * const auth = await getAuthenticatedUser(request);
 * if (!auth) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
 * // auth.userId is now verified — use it instead of request body/query params
 * ```
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string } | null> {
  const token = extractToken(request);
  if (!token) return null;

  const userId = await validateSession(token);
  if (!userId) return null;

  return { userId };
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(token: string): Promise<void> {
  await db.session.delete({ where: { token } }).catch(() => {});
}

/**
 * Set the httpOnly session cookie on a response
 * Uses Secure + SameSite=Strict for maximum protection
 */
export function setSessionCookie(response: NextResponse, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_DURATION_HOURS * 60 * 60, // 24 hours in seconds
  });
}

/**
 * Clear the httpOnly session cookie on a response (logout)
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Expire immediately
  });
}

/**
 * Get the cookie name (for client-side awareness, e.g., checking if cookie exists)
 */
export function getCookieName(): string {
  return COOKIE_NAME;
}
