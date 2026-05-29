import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { purchaseListing, verifyAccess, getPurchaseHistory } from '@/lib/marketplace/purchase-system';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'history';

    if (action === 'verify') {
      const listingId = searchParams.get('listingId');
      if (!listingId) return secureResponse(NextResponse.json({ error: 'listingId required' }, { status: 400 }), request);
      const hasAccess = await verifyAccess(auth.userId, listingId);
      return secureResponse(NextResponse.json({ hasAccess }), request);
    }

    // Default: purchase history
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await getPurchaseHistory(auth.userId, { page, limit });
    return secureResponse(NextResponse.json(result), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get purchase history' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { listingId } = body;

    if (!listingId) {
      return secureResponse(NextResponse.json({ error: 'listingId is required' }, { status: 400 }), request);
    }

    const purchase = await purchaseListing({
      listingId,
      userId: auth.userId,
    });

    return secureResponse(NextResponse.json(purchase, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete purchase';
    const status = message.includes('not found') || message.includes('own listing') || message.includes('Insufficient') ? 400 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}
