import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { addReview, getReviews, getAverageRating, markHelpful } from '@/lib/marketplace/review-system';

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
    const listingId = searchParams.get('listingId');
    const action = searchParams.get('action') || 'list';

    if (!listingId) {
      return secureResponse(NextResponse.json({ error: 'listingId is required' }, { status: 400 }), request);
    }

    if (action === 'average') {
      const rating = await getAverageRating(listingId);
      return secureResponse(NextResponse.json(rating), request);
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = (searchParams.get('sort') || 'newest') as any;

    const result = await getReviews(listingId, { page, limit, sortBy });
    return secureResponse(NextResponse.json(result), request);
  } catch {
    const res = NextResponse.json({ error: 'Failed to get reviews' }, { status: 500 });
    return secureResponse(res, request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'helpful') {
      const { reviewId } = body;
      if (!reviewId) return secureResponse(NextResponse.json({ error: 'reviewId required' }, { status: 400 }), request);
      const success = await markHelpful(reviewId);
      return secureResponse(NextResponse.json({ success }), request);
    }

    // Default: add review
    const { listingId, rating, title, content } = body;
    if (!listingId || !rating) {
      return secureResponse(NextResponse.json({ error: 'listingId and rating are required' }, { status: 400 }), request);
    }

    const review = await addReview({
      listingId,
      userId: auth.userId,
      rating,
      title,
      content,
    });

    return secureResponse(NextResponse.json(review, { status: 201 }), request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add review';
    const status = message.includes('own listing') || message.includes('integer') ? 400 : 500;
    const res = NextResponse.json({ error: message }, { status });
    return secureResponse(res, request);
  }
}
