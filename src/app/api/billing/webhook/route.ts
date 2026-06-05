/**
 * Billing Webhook API — POST: Stripe webhook handler
 *
 * This endpoint receives webhooks from Stripe and processes
 * subscription lifecycle events.
 *
 * NOTE: This endpoint does NOT use applySecurity because Stripe
 * webhooks use their own signature verification. No auth cookies
 * or tokens are expected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/billing/stripe-client';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const result = await handleWebhook(payload, signature);

    return NextResponse.json({
      received: result.received,
      event: result.event,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Distinguish between signature errors and processing errors
    if (message.includes('signature') || message.includes('Invalid')) {
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Webhook processing failed', details: message },
      { status: 500 }
    );
  }
}
