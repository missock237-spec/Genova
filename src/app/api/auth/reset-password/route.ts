import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { validateBody, resetPasswordSchema } from '@/lib/validation';
import { checkRateLimit, secureResponse, RATE_LIMITS } from '@/lib/security';

const MAX_CODE_ATTEMPTS = 3;

/**
 * POST /api/auth/reset-password
 * Verifies the 6-digit code and resets the user's password.
 *
 * Rate limited: 5 requests per 15 minutes per IP.
 * Max 3 attempts to enter the code before it's invalidated.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitError = checkRateLimit(request, undefined, RATE_LIMITS.login);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();
    const validation = validateBody(resetPasswordSchema, body);
    if (!validation.success) return validation.error;

    const { email, code, newPassword } = validation.data;

    // Find the most recent unused reset code for this email
    const resetEntry = await db.passwordReset.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetEntry) {
      // Increment attempts on any existing codes for this email
      const anyCode = await db.passwordReset.findFirst({
        where: { email, used: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });

      if (anyCode) {
        const newAttempts = anyCode.attempts + 1;
        if (newAttempts >= MAX_CODE_ATTEMPTS) {
          // Invalidate the code after too many attempts
          await db.passwordReset.update({
            where: { id: anyCode.id },
            data: { used: true, attempts: newAttempts },
          });
          return NextResponse.json(
            { error: 'Trop de tentatives. Veuillez demander un nouveau code.' },
            { status: 429 }
          );
        }

        await db.passwordReset.update({
          where: { id: anyCode.id },
          data: { attempts: newAttempts },
        });
      }

      return NextResponse.json(
        { error: 'Code invalide ou expiré' },
        { status: 400 }
      );
    }

    // Verify the user still exists
    const user = await db.user.findUnique({ where: { id: resetEntry.userId } });
    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Update the user's password in a transaction
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      db.passwordReset.update({
        where: { id: resetEntry.id },
        data: { used: true },
      }),
      // Invalidate all existing sessions for security (force re-login)
      db.session.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    // Log the password change
    await db.activityLog.create({
      data: {
        action: 'Mot de passe modifié',
        details: JSON.stringify({ email: user.email, method: 'reset_code' }),
        category: 'auth',
        userId: user.id,
      },
    });

    const response = NextResponse.json({
      message: 'Mot de passe modifié avec succès. Veuillez vous reconnecter.',
    });

    return secureResponse(request, response);
  } catch (error) {
    console.error('[RESET-PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
