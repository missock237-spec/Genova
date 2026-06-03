import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/auth';
import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    redirect('/login?error=invalid_token');
  }

  const hashedToken = await hashToken(token);

  const verification = await db.emailVerification.findFirst({
    where: { token: hashedToken },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!verification || verification.expiresAt < new Date()) {
    if (verification) {
      await db.emailVerification.delete({ where: { id: verification.id } }).catch(() => {});
    }
    redirect('/login?error=token_expired');
  }

  try {
    await db.$transaction([
      db.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true, isActive: true, emailVerified: new Date() },
      }),
      db.emailVerification.delete({ where: { id: verification.id } }),
    ]);
  } catch {
    redirect('/login?error=verification_failed');
  }

  redirect('/login?success=email_verified');
}
