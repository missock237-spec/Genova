import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        avatar: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      const res = NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    const res = NextResponse.json(user);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
