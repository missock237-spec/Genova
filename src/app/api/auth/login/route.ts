import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, migrateToPBKDF2 } from '@/lib/auth';
import { createSession, setSessionCookie } from '@/lib/session';
import { validateBody, loginSchema } from '@/lib/validation';
import { checkRateLimit, secureResponse, RATE_LIMITS } from '@/lib/security';

/**
 * POST /api/auth/login
 * FIX: Added Zod validation, rate limiting, httpOnly cookie session.
 * Token is now set as httpOnly cookie — not returned in response body for XSS protection.
 * Also migrates legacy SHA-256 password hashes to PBKDF2 on successful login.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit login attempts (brute force protection)
    const rateLimitError = checkRateLimit(request, undefined, RATE_LIMITS.login);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const validation = validateBody(loginSchema, body);
    if (!validation.success) return validation.error;

    const { email, password } = validation.data;

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 });
    }

    // Migrate legacy SHA-256 password to PBKDF2 (non-blocking, best effort)
    const newHash = await migrateToPBKDF2(password, user.password);
    if (newHash) {
      await db.user.update({
        where: { id: user.id },
        data: { password: newHash },
      }).catch(err => {
        console.error('[LOGIN] Failed to migrate password hash:', err);
      });
    }

    // Create a session and get the token
    const token = await createSession(user.id);

    await db.activityLog.create({
      data: {
        action: 'Connexion',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: user.id,
      },
    });

    // Build response WITHOUT the token in the body (security: httpOnly cookie only)
    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      avatar: user.avatar,
      // Token is NOT in the response body — it's set as httpOnly cookie
    });

    // Set the session token as an httpOnly, Secure, SameSite=Strict cookie
    setSessionCookie(response, token);

    return secureResponse(request, response);
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    return NextResponse.json({ error: 'Erreur lors de la connexion' }, { status: 500 });
  }
}
