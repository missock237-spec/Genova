import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse, verifyOwnership } from '@/lib/security';
import { getListing, updateListing, deleteListing } from '@/lib/marketplace/listing-manager';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const listing = await getListing(id);

    if (!listing) {
      return secureResponse(NextResponse.json({ error: 'Listing not found' }, { status: 404 }), request);
    }

    return secureResponse(NextResponse.json(listing), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get listing' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const listing = await updateListing(auth.userId, id, body);
    return secureResponse(NextResponse.json(listing), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update listing';
    const status = message.includes('not found') ? 404 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { id } = await params;
    const deleted = await deleteListing(auth.userId, id);

    if (!deleted) {
      return secureResponse(NextResponse.json({ error: 'Listing not found' }, { status: 404 }), request);
    }

    return secureResponse(NextResponse.json({ success: true }), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to delete listing' }, { status: 500 });
    return secureResponse(res, request);
  }
}
