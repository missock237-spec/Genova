import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { searchListings, createListing } from '@/lib/marketplace/listing-manager';

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
    const query = searchParams.get('q') || undefined;
    const type = searchParams.get('type') || undefined;
    const category = searchParams.get('category') || undefined;
    const sortBy = (searchParams.get('sort') || 'newest') as any;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || 'published';

    const result = await searchListings({
      query,
      type: type as any,
      category: category as any,
      sortBy,
      page,
      limit,
      status: status as any,
    });

    return secureResponse(NextResponse.json(result), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to search listings' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { type, name, description, category, tags, price, currency, config, previewUrl, metadata } = body;

    if (!type || !name || !description) {
      return secureResponse(NextResponse.json({ error: 'Type, name, and description are required' }, { status: 400 }), request);
    }

    const listing = await createListing(auth.userId, {
      type,
      name,
      description,
      category,
      tags,
      price,
      currency,
      config,
      previewUrl,
      metadata,
    });

    return secureResponse(NextResponse.json(listing, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create listing';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
