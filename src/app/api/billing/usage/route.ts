/**
 * Billing Usage API — GET: Usage stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getUsageForPeriod, getUsageTrends, getUsageStats } from '@/lib/billing/usage-meter';
import type { BillingPeriod } from '@/lib/billing/usage-meter';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    const period = (searchParams.get('period') as BillingPeriod) || 'monthly';
    const includeTrends = searchParams.get('trends') === 'true';
    const trendDays = parseInt(searchParams.get('days') || '30', 10);

    const validPeriods: BillingPeriod[] = ['daily', 'weekly', 'monthly'];
    if (!validPeriods.includes(period)) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid period. Must be one of: ${validPeriods.join(', ')}` },
          { status: 400 }
        ),
        request
      );
    }

    const [usage, stats] = await Promise.all([
      getUsageForPeriod(auth.userId, period),
      getUsageStats(auth.userId),
    ]);

    const result: Record<string, unknown> = {
      usage,
      stats,
    };

    if (includeTrends) {
      const trends = await getUsageTrends(auth.userId, Math.min(trendDays, 90));
      result.trends = trends;
    }

    return secureResponse(NextResponse.json(result), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch usage stats', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}
