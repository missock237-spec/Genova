import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;

    const account = await db.socialAccount.findUnique({
      where: { id },
    });

    if (!account) {
      const res = NextResponse.json(
        { error: 'Social account not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    if (account.userId !== auth.userId) {
      const res = NextResponse.json(
        { error: 'You do not have permission to disconnect this account' },
        { status: 403 }
      );
      return secureResponse(res, request);
    }

    await db.socialAccount.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        action: 'Social Account Disconnected',
        details: JSON.stringify({ platform: account.platform, accountName: account.accountName }),
        category: 'social',
        userId: auth.userId,
      },
    });

    const res = NextResponse.json({ success: true });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to disconnect social account' },
      { status: 500 }
    );
    return secureResponse(res, request);
  }
}
