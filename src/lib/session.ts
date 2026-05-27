// Session Management — Secure token-based API authorization
// FIX (Bug #5): The original API routes accepted `userId` from query params/body
// without verifying the authenticated user, allowing cross-user data access.
// This module provides `getAuthenticatedUser()` to validate Bearer tokens
// and return the authenticated user's ID, enforcing proper authorization.

import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

const SESSION_DURATION_HOURS = 24;

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
 * Returns the session token to be used as Bearer token
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
 * Extract and validate the authenticated user from a Next.js API request
 * Checks the Authorization header for a Bearer token
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
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7).trim();
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
