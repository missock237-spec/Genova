import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { applySecurity, secureResponse } from '@/lib/security';

// Always return same response to prevent enumeration
const SUCCESS_RESPONSE = {
  message: 'If the email exists and is not yet verified, a new verification code has been sent.',
};

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 3, windowMs: 60000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      const res = NextResponse.json(
        { error: 'Email is required' },
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

    // Always return same response to prevent enumeration
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true },
    });

    if (!user || user.emailVerified) {
      const res = NextResponse.json(SUCCESS_RESPONSE);
      return secureResponse(res, request);
    }

    // Invalidate any existing unused verification codes for this email
    await db.emailVerification.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    // Generate 6-digit code using cryptographically secure random
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create new verification code
    await db.emailVerification.create({
      data: {
        email: normalizedEmail,
        code,
        expiresAt,
        userId: user.id,
      },
    });

    // Send verification email
    await sendEmail(
      normalizedEmail,
      'Email Verification Code - Genova AgentOS',
      `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Verify Your Email</h2>
        <p>Thank you for registering with Genova AgentOS. Please use the following code to verify your email address:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; padding: 12px 24px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </p>
        <p>This code expires in 15 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't create an account, please ignore this email.</p>
      </div>
    `
    );

    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
  } catch {
    // Still return success to prevent email enumeration
    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
  }
}
