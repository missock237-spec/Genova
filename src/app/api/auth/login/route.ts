/**
 * GENOVA AI OS — POST /api/auth/login
 * Production-ready login endpoint.
 *
 * Flow:
 *  1. Rate limiting (10 req/15min per IP, 5 req/15min per email)
 *  2. Zod validation
 *  3. User lookup + password verify (constant time)
 *  4. Auto-migrate hash if needed
 *  5. Check account status (active, email verified)
 *  6. Create session (httpOnly cookies) with rememberMe
 *  7. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword, createAuditLog } from '@/lib/auth';
import { createSession, setSessionCookie, setRefreshCookie } from '@/lib/session';
import { loginSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('login');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // ── 1. Rate Limiting (IP) ─────────────────────────────────────────────────
  const ipRl = await rateLimit(`login:ip:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!ipRl.success) {
    log.warn('IP rate limit exceeded', { ip });
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { email, password, rememberMe } = parsed.data;

  // Per-email rate limit
  const emailRl = await rateLimit(`login:email:${email}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!emailRl.success) {
    log.warn('Email rate limit exceeded', { email, ip });
    return NextResponse.json(
      { error: 'Compte temporairement verrouillé. Réessayez dans 15 minutes.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
  }

  // ── 3. Lookup User ────────────────────────────────────────────────────────
  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      password: true,
      isActive: true,
      isEmailVerified: true,
      plan: true,
      avatar: true,
    },
  });

  // Constant-time dummy hash to prevent timing attacks even when user not found
  if (!user) {
    await verifyPassword(password, 'pbkdf2:100000:deadbeef00000000000000000000000000000000000000000000000000000000:deadbeef00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
    log.info('Unknown email attempt', { email, ip });
    return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
  }

  // ── 4. Verify Password ────────────────────────────────────────────────────
  const { valid, needsMigration: shouldMigrate } = await verifyPassword(password, user.password);

  if (!valid) {
    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_FAILED',
      resource: 'session',
      details: { reason: 'invalid_password', ip },
      ipAddress: ip,
      userAgent: req.headers.get('user-agent') ?? 'unknown',
      severity: 'warning',
    });
    log.warn('Invalid password', { userId: user.id, ip });
    return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
  }

  // ── 4b. Auto-migrate legacy hash ─────────────────────────────────────────
  if (shouldMigrate) {
    try {
      const newHash = await hashPassword(password);
      await db.user.update({ where: { id: user.id }, data: { password: newHash } });
      log.info('Password hash migrated', { userId: user.id });
    } catch (err) {
      log.error('Hash migration failed (non-blocking)', { err, userId: user.id });
    }
  }

  // ── 5. Check Account Status ───────────────────────────────────────────────
  if (!user.isEmailVerified) {
    return NextResponse.json(
      { error: 'Veuillez vérifier votre adresse email avant de vous connecter.' },
      { status: 403 }
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: 'Ce compte a été désactivé. Contactez le support.' },
      { status: 403 }
    );
  }

  // ── 6. Create Session ─────────────────────────────────────────────────────
  const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || undefined;
  const userAgent = req.headers.get('user-agent') || undefined;

  let token: string;
  let refreshToken: string;
  try {
    const sessionResult = await createSession(user.id, {
      ipAddress,
      userAgent,
      rememberMe: rememberMe ?? false,
    });
    token = sessionResult.token;
    refreshToken = sessionResult.refreshToken;
  } catch (err) {
    log.error('Session creation failed', { err, userId: user.id });
    return NextResponse.json({ error: 'Erreur lors de la création de session' }, { status: 500 });
  }

  // ── 7. Audit Log ──────────────────────────────────────────────────────────
  await createAuditLog({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    resource: 'session',
    details: { rememberMe, ip },
    ipAddress: ip,
    userAgent: req.headers.get('user-agent') ?? 'unknown',
    severity: 'info',
  });

  await db.activityLog.create({
    data: {
      action: 'Login',
      details: JSON.stringify({ email }),
      category: 'auth',
      userId: user.id,
    },
  }).catch(() => {});

  log.info('Login successful', { userId: user.id, ip });

  const userData = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    emailVerified: user.isEmailVerified, // backward compat for old auth-form
  };

  const res = NextResponse.json({
    ...userData,       // Flat fields for backward compatibility
    user: userData,    // Nested for new auth forms
  });
  setSessionCookie(res, token, rememberMe);
  setRefreshCookie(res, refreshToken);

  return res;
}
