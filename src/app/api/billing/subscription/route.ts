/**
 * Billing Subscription API — GET/PUT: Manage subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getSubscription } from '@/lib/billing/stripe-client';
import { changePlan, getPlan, type PlanTier } from '@/lib/billing/plans';
import { db } from '@/lib/db';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 100, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const subscription = await getSubscription(auth.userId);
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { plan: true },
    });

    const currentPlan = getPlan((user?.plan as PlanTier) || 'free');

    return secureResponse(
      NextResponse.json({
        subscription,
        currentPlan: currentPlan ? {
          id: currentPlan.id,
          name: currentPlan.name,
          price: currentPlan.price,
          credits: currentPlan.credits,
        } : null,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch subscription', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}

export async function PUT(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { planId } = body;

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

    const result = await changePlan(auth.userId, planId);

    return secureResponse(
      NextResponse.json({
        success: result.success,
        message: result.message,
        newPlan: result.newPlan,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to update subscription', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
