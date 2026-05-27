import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateBody, forgotPasswordSchema } from '@/lib/validation';
import { checkRateLimit, secureResponse, RATE_LIMITS } from '@/lib/security';
import { sendPasswordResetCode } from '@/lib/email';

/**
 * POST /api/auth/forgot-password
 * Generates a 6-digit verification code, stores it in the database,
 * and sends it to the user's email address.
 *
 * Rate limited: 5 requests per 15 minutes per IP (brute force protection).
 * Always returns success to prevent email enumeration.
 */
export async function POST(request: NextRequest) {
  try {
    // Strict rate limit on forgot-password attempts
    const rateLimitError = checkRateLimit(request, undefined, RATE_LIMITS.login);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const validation = validateBody(forgotPasswordSchema, body);
    if (!validation.success) return validation.error;

    const { email } = validation.data;

    // Find user by email — but don't reveal whether the email exists
    const user = await db.user.findUnique({ where: { email } });

    if (user) {
      // Clean up any existing unused reset codes for this user
      await db.passwordReset.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });

      // Generate a 6-digit code
      const code = Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 10)
      ).join('');

      // Store the code (expires in 15 minutes)
      await db.passwordReset.create({
        data: {
          email: user.email,
          code,
          userId: user.id,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      // Send the code via email
      const sent = await sendPasswordResetCode(user.email, code, user.name);
      if (!sent) {
        console.error(`[FORGOT-PASSWORD] Failed to send email to ${user.email}`);
      }
    }

    // Always return the same response to prevent email enumeration
    const response = NextResponse.json({
      message: 'Si un compte existe avec cet email, un code de validation a été envoyé.',
    });

    return secureResponse(request, response);
  } catch (error) {
    console.error('[FORGOT-PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
