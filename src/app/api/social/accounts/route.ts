import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const VALID_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'linkedin'];

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
    const accounts = await db.socialAccount.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const res = NextResponse.json(accounts);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch social accounts' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { platform, accountId, accountName, accessToken, refreshToken } = body;

    if (!platform || !accountId || !accountName || !accessToken) {
      const res = NextResponse.json(
        { error: 'Platform, accountId, accountName, and accessToken are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      const res = NextResponse.json(
        { error: `Invalid platform. Allowed: ${VALID_PLATFORMS.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (accountId.length > 200 || accountName.length > 200) {
      const res = NextResponse.json(
        { error: 'accountId and accountName must be at most 200 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (accessToken.length > 5000) {
      const res = NextResponse.json(
        { error: 'accessToken too long (max 5000 characters)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check if this account is already connected
    const existing = await db.socialAccount.findUnique({
      where: {
        userId_platform_accountId: {
          userId: auth.userId,
          platform,
          accountId,
        },
      },
    });

    if (existing) {
      const res = NextResponse.json(
        { error: 'This social account is already connected' },
        { status: 409 }
      );
      return secureResponse(res, request);
    }

    const account = await db.socialAccount.create({
      data: {
        platform,
        accountId,
        accountName,
        accessToken,
        refreshToken: refreshToken || null,
        userId: auth.userId,
      },
    });

    await db.activityLog.create({
      data: {
        action: 'Social Account Connected',
        details: JSON.stringify({ platform, accountName }),
        category: 'social',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json(
      {
        id: account.id,
        platform: account.platform,
        accountId: account.accountId,
        accountName: account.accountName,
        isActive: account.isActive,
        createdAt: account.createdAt,
      },
      { status: 201 }
    );
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to connect social account' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
