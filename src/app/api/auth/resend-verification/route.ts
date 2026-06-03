/**
 * GENOVA AI OS — POST /api/auth/resend-verification
 * Resends email verification link (uses new PBKDF2 token system).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, hashToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/mailer';
import { rateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('resend-verification');

const SUCCESS_RESPONSE = {
  message: 'If the email exists and is not yet verified, a new verification email has been sent.',
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 3 req / 15 min per IP
  const rl = await rateLimit(`resend:${ip}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (normalizedEmail.length > 255) {
      return NextResponse.json({ error: 'Email trop long' }, { status: 400 });
    }

    // Always return same response to prevent enumeration
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isEmailVerified: true },
    });

    if (!user || user.isEmailVerified) {
      return NextResponse.json(SUCCESS_RESPONSE);
    }

    // Invalidate any existing verification tokens for this user
    await db.emailVerification.deleteMany({ where: { userId: user.id } });

    // Generate new PBKDF2-hashed token
    const rawToken = generateResetToken();
    const hashedToken = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db.emailVerification.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: rawToken,
      });
    } catch (err) {
      log.error('Failed to send verification email', { err, userId: user.id });
    }

    return NextResponse.json(SUCCESS_RESPONSE);
  } catch {
    return NextResponse.json(SUCCESS_RESPONSE);
  }
}
