import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { createSession } from '@/lib/session';
import { validateBody, registerSchema } from '@/lib/validation';
import { checkRateLimit, secureResponse, RATE_LIMITS } from '@/lib/security';

/**
 * POST /api/auth/register
 * FIX: Added Zod validation (email format, password strength), rate limiting, auto-session creation.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitError = checkRateLimit(request, undefined, RATE_LIMITS.auth);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const validation = validateBody(registerSchema, body);
    if (!validation.success) return validation.error;

    const { email, name, password } = validation.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: { email, name, password: hashedPassword },
    });

    const token = await createSession(user.id);

    await db.activityLog.create({
      data: {
        action: 'Inscription',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: user.id,
      },
    });

    return secureResponse(request, NextResponse.json({
      id: user.id, email: user.email, name: user.name, plan: user.plan, avatar: user.avatar, token,
    }, { status: 201 }));
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'inscription' }, { status: 500 });
  }
}
