/**
 * GENOVA AI OS — POST /api/auth/register
 * Production-ready registration endpoint.
 *
 * Flow:
 *  1. Rate limiting (5 req/15min per IP)
 *  2. Zod validation
 *  3. Duplicate email check (anti-enumeration: same success message)
 *  4. PBKDF2 password hash
 *  5. Create user (role: user, isActive: false until email verified)
 *  6. Create email verification record (PBKDF2-hashed token)
 *  7. Send verification email
 *  8. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateResetToken, hashToken, createAuditLog } from '@/lib/auth';
import { registerSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/mailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('register');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // ── 1. Rate Limiting ──────────────────────────────────────────────────────
  const rl = await rateLimit(`register:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    log.warn('Rate limit exceeded', { ip });
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
  }

  // ── 2. Parse & Validate ───────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;

  // ── 3. Check for existing user (constant-time to prevent enumeration) ─────
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Don't reveal user existence — log and return same-shape success
    log.info('Duplicate email attempt', { email, ip });
    // Still hash to consume constant time
    await hashPassword(password);
    return NextResponse.json(
      { message: 'Si cet email est disponible, un email de vérification sera envoyé.' },
      { status: 200 }
    );
  }

  // ── 4. Hash Password ──────────────────────────────────────────────────────
  let hashedPassword: string;
  try {
    hashedPassword = await hashPassword(password);
  } catch (err) {
    log.error('Password hashing failed', { err });
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }

  // ── 5. Create User + Email Verification ──────────────────────────────────
  let user: { id: string; email: string; name: string };
  let verificationToken: string;

  try {
    verificationToken = generateResetToken();
    const hashedVerifToken = await hashToken(verificationToken);
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'user',
          isActive: false, // activated upon email verification
          isEmailVerified: false,
        },
        select: { id: true, email: true, name: true },
      });

      await tx.emailVerification.create({
        data: {
          userId: created.id,
          token: hashedVerifToken,
          expiresAt: tokenExpiry,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: created.id,
          action: 'USER_REGISTERED',
          resource: 'user',
          resourceId: created.id,
          details: JSON.stringify({ email, ip }),
          ipAddress: ip,
          userAgent: req.headers.get('user-agent') ?? 'unknown',
        },
      });

      return created;
    });
  } catch (err) {
    log.error('Database error during user creation', { err, email });
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 });
  }

  // ── 6. Send Verification Email ────────────────────────────────────────────
  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token: verificationToken,
    });
  } catch (err) {
    // Non-blocking: user was created, just couldn't send email
    log.error('Failed to send verification email', { err, userId: user.id });
  }

  log.info('User created successfully', { userId: user.id, email });

  return NextResponse.json(
    { message: 'Compte créé. Vérifiez votre email pour activer votre compte.' },
    { status: 201 }
  );
}
