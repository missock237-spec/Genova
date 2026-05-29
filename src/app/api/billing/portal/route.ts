/**
 * Billing Portal API — POST: Create portal session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createPortalSession } from '@/lib/billing/stripe-client';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { returnUrl } = body;

    const session = await createPortalSession({
      userId: auth.userId,
      returnUrl,
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        url: session.url,
      }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('No active Stripe customer')) {
      return secureResponse(
        NextResponse.json(
          { error: 'No active subscription found. Please subscribe to a plan first.' },
          { status: 400 }
        ),
        request
      );
    }

    return secureResponse(
      NextResponse.json(
        { error: 'Failed to create portal session', details: message },
        { status: 500 }
      ),
      request
    );
  }
}
