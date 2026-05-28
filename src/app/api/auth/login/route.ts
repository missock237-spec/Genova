import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, needsMigration, hashPassword, createAuditLog } from '@/lib/auth';
import { createSession, setSessionCookie, setRefreshCookie } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    rateLimit: { limit: 5, windowMs: 15000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    let { email, password } = body;

    if (!email || !password) {
      const res = NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Normalize email
    email = String(email).trim().toLowerCase();

    // Input length validation
    if (email.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (password.length > 128) {
      const res = NextResponse.json(
        { error: 'Password must be at most 128 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      const res = NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
      return secureResponse(res, request);
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      const res = NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
      return secureResponse(res, request);
    }

    // Migrate legacy password hash if needed
    if (needsMigration(user.password)) {
      const newHash = await hashPassword(password);
      await db.user.update({
        where: { id: user.id },
        data: { password: newHash },
      });
    }

    // Capture IP and UA info
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    // Create session (allow multiple concurrent sessions - do NOT delete existing sessions)
    const { token, refreshToken } = await createSession(user.id, {
      ipAddress,
      userAgent,
    });

    await db.activityLog.create({
      data: {
        action: 'Login',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: user.id,
      },
    });

    const res = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      avatar: user.avatar,
      role: user.role || 'user',
      emailVerified: !!user.emailVerified,
    });
    setSessionCookie(res, token);
    setRefreshCookie(res, refreshToken);

    // Audit log for successful login
    await createAuditLog({
      userId: user.id,
      action: 'login',
      resource: 'session',
      ipAddress,
      userAgent,
      severity: 'info',
    });

    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
