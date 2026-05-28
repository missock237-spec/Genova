import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
    const { email, code } = body;

    if (!email || !code) {
      const res = NextResponse.json(
        { error: 'Email and verification code are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Normalize email
    const normalizedEmail = String(email).trim().toLowerCase();

    // Input length validation
    if (normalizedEmail.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Find the latest unused verification entry for this email
    const verification = await db.emailVerification.findFirst({
      where: {
        email: normalizedEmail,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      const res = NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check max attempts
    if (verification.attempts >= 3) {
      await db.emailVerification.update({
        where: { id: verification.id },
        data: { used: true },
      });
      const res = NextResponse.json(
        { error: 'Maximum attempts exceeded. Please request a new verification code.' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Timing-safe code comparison
    const storedBuffer = Buffer.from(String(verification.code), 'utf-8');
    const inputBuffer = Buffer.from(String(code), 'utf-8');
    const codeMatches =
      storedBuffer.length === inputBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, inputBuffer);

    if (!codeMatches) {
      await db.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 },
      });
      const remaining = 3 - (verification.attempts + 1);
      const res = NextResponse.json(
        { error: `Invalid verification code. ${remaining} attempts remaining.` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Mark verification as used
    await db.emailVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // Set emailVerified on the user
    await db.user.update({
      where: { id: verification.userId },
      data: { emailVerified: new Date() },
    });

    // Invalidate all other unused verification codes for this email
    await db.emailVerification.updateMany({
      where: {
        email: normalizedEmail,
        used: false,
        id: { not: verification.id },
      },
      data: { used: true },
    });

    const res = NextResponse.json({
      message: 'Email verified successfully',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Email verification failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
