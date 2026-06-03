/**
 * GENOVA AI OS — GET /api/auth/verify-email
 * Server-side email verification via token.
 *
 * Flow:
 *  1. Accept token parameter from searchParams
 *  2. Hash token, look up in EmailVerification
 *  3. Check token expiry
 *  4. Set isEmailVerified: true, isActive: true on user
 *  5. Delete verification record
 *  6. Redirect to /login?success=email_verified
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken, createAuditLog } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('verify-email');

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  const hashedToken = await hashToken(token);

  const verification = await db.emailVerification.findFirst({
    where: { token: hashedToken },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!verification) {
    log.warn('Invalid verification token attempt');
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  if (verification.expiresAt < new Date()) {
    await db.emailVerification.delete({ where: { id: verification.id } }).catch(() => {});
    return NextResponse.redirect(new URL('/login?error=token_expired', req.url));
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true, isActive: true, emailVerified: new Date() },
      }),
      db.emailVerification.delete({ where: { id: verification.id } }),
    ]);

    await createAuditLog({
      userId: verification.userId,
      action: 'EMAIL_VERIFIED',
      resource: 'user',
      resourceId: verification.userId,
      severity: 'info',
    });

    log.info('Email verified successfully', { userId: verification.userId });
  } catch (err) {
    log.error('Email verification failed', { err, userId: verification.userId });
    return NextResponse.redirect(new URL('/login?error=verification_failed', req.url));
  }

  return NextResponse.redirect(new URL('/login?success=email_verified', req.url));
}
