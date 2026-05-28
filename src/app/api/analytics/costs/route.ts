import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  try {
    const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
    if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const userId = auth.userId;
    const period = request.nextUrl.searchParams.get('period') || '30d';
    const provider = request.nextUrl.searchParams.get('provider');

    // Calculate date range based on period
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const whereClause: Record<string, unknown> = {
      userId,
      createdAt: { gte: startDate },
    };
    if (provider) {
      whereClause.provider = provider;
    }

    // Get AI costs with grouping
    const aiCosts = await db.aICost.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    // Group by provider and model
    const byProviderAndModel = new Map<string, {
      provider: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      callCount: number;
    }>();

    for (const cost of aiCosts) {
      const key = `${cost.provider}|${cost.model}`;
      const existing = byProviderAndModel.get(key);
      if (existing) {
        existing.promptTokens += cost.promptTokens;
        existing.completionTokens += cost.completionTokens;
        existing.totalTokens += cost.totalTokens;
        existing.costUsd += cost.costUsd;
        existing.callCount += 1;
      } else {
        byProviderAndModel.set(key, {
          provider: cost.provider,
          model: cost.model,
          promptTokens: cost.promptTokens,
          completionTokens: cost.completionTokens,
          totalTokens: cost.totalTokens,
          costUsd: cost.costUsd,
          callCount: 1,
        });
      }
    }

    // Group by provider
    const byProvider = new Map<string, {
      provider: string;
      totalTokens: number;
      costUsd: number;
      callCount: number;
      models: {
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        costUsd: number;
        callCount: number;
      }[];
    }>();

    for (const [, detail] of byProviderAndModel) {
      const existing = byProvider.get(detail.provider);
      if (existing) {
        existing.totalTokens += detail.totalTokens;
        existing.costUsd += detail.costUsd;
        existing.callCount += detail.callCount;
        existing.models.push({
          model: detail.model,
          promptTokens: detail.promptTokens,
          completionTokens: detail.completionTokens,
          totalTokens: detail.totalTokens,
          costUsd: detail.costUsd,
          callCount: detail.callCount,
        });
      } else {
        byProvider.set(detail.provider, {
          provider: detail.provider,
          totalTokens: detail.totalTokens,
          costUsd: detail.costUsd,
          callCount: detail.callCount,
          models: [{
            model: detail.model,
            promptTokens: detail.promptTokens,
            completionTokens: detail.completionTokens,
            totalTokens: detail.totalTokens,
            costUsd: detail.costUsd,
            callCount: detail.callCount,
          }],
        });
      }
    }

    // Daily cost breakdown
    const dailyCostMap = new Map<string, { date: string; costUsd: number; tokens: number; calls: number }>();
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      dailyCostMap.set(key, { date: key, costUsd: 0, tokens: 0, calls: 0 });
    }

    for (const cost of aiCosts) {
      const day = cost.createdAt.toISOString().split('T')[0];
      const entry = dailyCostMap.get(day);
      if (entry) {
        entry.costUsd += cost.costUsd;
        entry.tokens += cost.totalTokens;
        entry.calls += 1;
      }
    }

    const totalCost = aiCosts.reduce((sum, c) => sum + c.costUsd, 0);
    const totalTokens = aiCosts.reduce((sum, c) => sum + c.totalTokens, 0);

    return secureResponse(
      NextResponse.json({
        period,
        totalCost,
        totalTokens,
        totalCalls: aiCosts.length,
        byProvider: Array.from(byProvider.values()),
        byModel: Array.from(byProviderAndModel.values()),
        daily: Array.from(dailyCostMap.values()),
      }),
      request
    );
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }),
      request
    );
  }
}
