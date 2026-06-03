/**
 * GENOVA AI OS — GET /api/auth/me
 * Returns current authenticated user data.
 * Uses getCurrentSession() for cookie-based auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentSession, extractToken, validateSession } from '@/lib/session';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Try cookie-based session first
    const session = await getCurrentSession();

    if (session) {
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          avatar: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatar: user.avatar,
        role: user.role || 'user',
        emailVerified: user.isEmailVerified,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
      });
    }

    // Fallback: check Authorization header / cookie token manually
    const token = extractToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = await validateSession(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        avatar: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      avatar: user.avatar,
      role: user.role || 'user',
      emailVerified: user.isEmailVerified,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
