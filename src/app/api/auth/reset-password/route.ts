import { NextRequest, NextResponse } from 'next/server';
import nodeCrypto from 'crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { deleteAllUserSessions } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 5, windowMs: 60000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      const res = NextResponse.json(
        { error: 'Email, code, and new password are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (email.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (newPassword.length < 8) {
      const res = NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (newPassword.length > 128) {
      const res = NextResponse.json(
        { error: 'Password must be at most 128 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Find the reset entry without filtering by code (so we can track attempts)
    const resetEntry = await db.passwordReset.findFirst({
      where: {
        email,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetEntry) {
      const res = NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check max attempts
    if (resetEntry.attempts >= 3) {
      await db.passwordReset.update({
        where: { id: resetEntry.id },
        data: { used: true },
      });
      const res = NextResponse.json(
        { error: 'Maximum attempts exceeded. Please request a new code.' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Verify the code matches using timing-safe comparison
    const codeBuffer = Buffer.from(String(resetEntry.code), 'utf-8');
    const inputBuffer = Buffer.from(String(code), 'utf-8');
    const codeMatches = codeBuffer.length === inputBuffer.length
      && nodeCrypto.timingSafeEqual(codeBuffer, inputBuffer);

    if (!codeMatches) {
      await db.passwordReset.update({
        where: { id: resetEntry.id },
        data: { attempts: resetEntry.attempts + 1 },
      });
      const remaining = 3 - (resetEntry.attempts + 1);
      const res = NextResponse.json(
        {
          error: `Invalid verification code. ${remaining} attempts remaining.`,
        },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await db.user.update({
      where: { id: resetEntry.userId },
      data: { password: hashedPassword },
    });

    // Mark reset code as used
    await db.passwordReset.update({
      where: { id: resetEntry.id },
      data: { used: true },
    });

    // Invalidate all existing sessions for this user
    await deleteAllUserSessions(resetEntry.userId);

    await db.activityLog.create({
      data: {
        action: 'Password Reset',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: resetEntry.userId,
      },
    });

    const res = NextResponse.json({
      message: 'Password has been reset successfully',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Password reset failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
