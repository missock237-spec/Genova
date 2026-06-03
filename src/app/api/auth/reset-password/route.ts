/**
 * GENOVA AI OS — POST /api/auth/reset-password
 *
 * Flow:
 *  1. Rate limiting
 *  2. Validate token + new password (Zod)
 *  3. Hash token → lookup in DB
 *  4. Check token expiry
 *  5. Hash new password
 *  6. Update user password + delete reset token
 *  7. Invalidate all existing sessions (security best practice)
 *  8. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, hashToken, createAuditLog } from '@/lib/auth';
import { deleteAllUserSessions } from '@/lib/session';
import { resetPasswordSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('reset-password');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 5 req / 15 min per IP
  const rl = await rateLimit(`reset:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de tentatives.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { token, password } = parsed.data;

  // Hash token for DB lookup
  const hashedToken = await hashToken(token);

  const resetRecord = await db.passwordReset.findFirst({
    where: { token: hashedToken },
    include: { user: { select: { id: true, email: true, isActive: true } } },
  });

  if (!resetRecord) {
    log.warn('Invalid token attempt', { ip });
    return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
  }

  if (resetRecord.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { id: resetRecord.id } });
    return NextResponse.json(
      { error: 'Ce lien a expiré. Veuillez faire une nouvelle demande.' },
      { status: 400 }
    );
  }

  if (!resetRecord.user.isActive) {
    return NextResponse.json({ error: 'Ce compte est désactivé.' }, { status: 403 });
  }

  const hashedPassword = await hashPassword(password);

  await db.$transaction(async (tx) => {
    // Update password
    await tx.user.update({
      where: { id: resetRecord.user.id },
      data: { password: hashedPassword },
    });

    // Delete used token
    await tx.passwordReset.delete({ where: { id: resetRecord.id } });

    // Invalidate ALL sessions (force re-login everywhere)
    await tx.session.deleteMany({ where: { userId: resetRecord.user.id } });

    // Audit
    await tx.auditLog.create({
      data: {
        userId: resetRecord.user.id,
        action: 'PASSWORD_RESET_SUCCESS',
        resource: 'user',
        details: JSON.stringify({ ip, sessionsInvalidated: true }),
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') ?? 'unknown',
        severity: 'warning',
      },
    });
  });

  log.info('Password reset successful', { userId: resetRecord.user.id });

  return NextResponse.json({ message: 'Mot de passe réinitialisé avec succès.' });
}
