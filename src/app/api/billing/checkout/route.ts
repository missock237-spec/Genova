/**
 * Billing Checkout API — POST: Create checkout session
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createCheckoutSession } from '@/lib/billing/stripe-client';
import { getPlan, type PlanTier } from '@/lib/billing/plans';

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
    const { planId, mode, successUrl, cancelUrl } = body;

    if (!planId) {
      return secureResponse(
        NextResponse.json({ error: 'Missing required field: planId' }, { status: 400 }),
        request
      );
    }

    // Validate plan
    const plan = getPlan(planId as PlanTier);
    if (!plan) {
      return secureResponse(
        NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 }),
        request
      );
    }

    if (!plan.stripePriceId) {
      return secureResponse(
        NextResponse.json({ error: 'This plan is not available for purchase' }, { status: 400 }),
        request
      );
    }

    const session = await createCheckoutSession({
      userId: auth.userId,
      priceId: plan.stripePriceId,
      planId,
      successUrl,
      cancelUrl,
      mode: mode || 'subscription',
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        sessionId: session.sessionId,
        url: session.url,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to create checkout session', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
