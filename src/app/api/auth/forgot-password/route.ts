/**
 * GENOVA AI OS — POST /api/auth/forgot-password
 * Sends password reset email.
 *
 * Security:
 *  - Always returns 200 (prevents email enumeration)
 *  - Rate limited per IP
 *  - Token hashed before DB storage
 *  - Token expires in 1 hour
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, hashToken, createAuditLog } from '@/lib/auth';
import { forgotPasswordSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('forgot-password');

const SUCCESS_RESPONSE = {
  message: 'Si un compte existe pour cet email, vous recevrez un lien de réinitialisation.',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 3 req / 15 min per IP
  const rl = await rateLimit(`forgot:${ip}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Email invalide', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { email } = parsed.data;

  // Always respond with success regardless of whether user exists
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) {
    log.info('Email not found or inactive', { email, ip });
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  // Invalidate existing reset tokens for this user
  await db.passwordReset.deleteMany({ where: { userId: user.id } });

  // Generate + hash token
  const rawToken = generateResetToken();
  const hashedToken = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.passwordReset.create({
    data: { userId: user.id, token: hashedToken, expiresAt },
  });

  await createAuditLog({
    userId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    resource: 'user',
    ipAddress: ip,
    userAgent: req.headers.get('user-agent') ?? 'unknown',
    severity: 'info',
  });

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken });
  } catch (err) {
    log.error('Failed to send email', { err, userId: user.id });
  }

  log.info('Reset token created', { userId: user.id });
  return NextResponse.json(SUCCESS_RESPONSE);
}
