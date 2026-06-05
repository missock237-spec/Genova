/**
 * Billing Credits API — GET: Balance, POST: Purchase credits
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getCreditBalance, getUsageHistory, purchaseCredits } from '@/lib/billing/credits';
import { CREDIT_PACKAGES } from '@/lib/billing/plans';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('history') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const balance = await getCreditBalance(auth.userId);

    const result: Record<string, unknown> = {
      balance,
      isUnlimited: balance === -1,
      packages: CREDIT_PACKAGES,
    };

    if (includeHistory) {
      const history = await getUsageHistory(auth.userId, { limit });
      result.history = history.entries;
      result.historyTotal = history.total;
    }

    return secureResponse(NextResponse.json(result), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch credit balance', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
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
    const { packageId } = body;

    if (!packageId) {
      return secureResponse(
        NextResponse.json({ error: 'Missing required field: packageId' }, { status: 400 }),
        request
      );
    }

    // Validate package
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return secureResponse(
        NextResponse.json(
          { error: 'Invalid credit package', availablePackages: CREDIT_PACKAGES.map((p) => p.id) },
          { status: 400 }
        ),
        request
      );
    }

    const result = await purchaseCredits(auth.userId, packageId);

    return secureResponse(
      NextResponse.json({
        success: true,
        checkoutUrl: result.checkoutUrl,
        sessionId: result.sessionId,
        package: {
          id: pkg.id,
          name: pkg.name,
          credits: pkg.credits,
          price: pkg.price,
        },
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to purchase credits', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
