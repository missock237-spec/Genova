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
    const agentId = request.nextUrl.searchParams.get('agentId');

    // Calculate date range based on period
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Try to get data from UsageDaily first
    const usageDailyRecords = await db.usageDaily.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    if (usageDailyRecords.length > 0) {
      // If we have aggregated daily data, return it
      const totals = usageDailyRecords.reduce(
        (acc, record) => ({
          agentCount: acc.agentCount + record.agentCount,
          taskCount: acc.taskCount + record.taskCount,
          totalTokens: acc.totalTokens + record.totalTokens,
          totalCostUsd: acc.totalCostUsd + record.totalCostUsd,
          apiCalls: acc.apiCalls + record.apiCalls,
        }),
        { agentCount: 0, taskCount: 0, totalTokens: 0, totalCostUsd: 0, apiCalls: 0 }
      );

      return secureResponse(
        NextResponse.json({
          period,
          daily: usageDailyRecords,
          totals,
        }),
        request
      );
    }

    // No UsageDaily records — aggregate from AgentUsage and AICost
    const agentUsageWhere: Record<string, unknown> = {
      userId,
      createdAt: { gte: startDate },
    };
    if (agentId) {
      agentUsageWhere.agentId = agentId;
    }

    const [agentUsages, aiCosts] = await Promise.all([
      db.agentUsage.findMany({
        where: agentUsageWhere,
        orderBy: { createdAt: 'asc' },
      }),
      db.aICost.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group by day
    const dailyMap = new Map<string, {
      date: string;
      agentCount: number;
      taskCount: number;
      totalTokens: number;
      totalCostUsd: number;
      apiCalls: number;
    }>();

    // Initialize all days in range
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      dailyMap.set(key, {
        date: key,
        agentCount: 0,
        taskCount: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        apiCalls: 0,
      });
    }

    // Aggregate agent usage by day
    const agentsByDay = new Map<string, Set<string>>();
    for (const usage of agentUsages) {
      const day = usage.createdAt.toISOString().split('T')[0];
      const entry = dailyMap.get(day);
      if (entry) {
        entry.totalTokens += usage.tokensUsed;
        entry.apiCalls += 1;

        if (!agentsByDay.has(day)) {
          agentsByDay.set(day, new Set());
        }
        agentsByDay.get(day)!.add(usage.agentId);
      }
    }

    // Set agent counts
    for (const [day, agentSet] of agentsByDay) {
      const entry = dailyMap.get(day);
      if (entry) {
        entry.agentCount = agentSet.size;
      }
    }

    // Aggregate AI costs by day
    for (const cost of aiCosts) {
      const day = cost.createdAt.toISOString().split('T')[0];
      const entry = dailyMap.get(day);
      if (entry) {
        entry.totalTokens += cost.totalTokens;
        entry.totalCostUsd += cost.costUsd;
        entry.apiCalls += 1;
      }
    }

    const daily = Array.from(dailyMap.values());

    const totals = daily.reduce(
      (acc, record) => ({
        agentCount: acc.agentCount + record.agentCount,
        taskCount: acc.taskCount + record.taskCount,
        totalTokens: acc.totalTokens + record.totalTokens,
        totalCostUsd: acc.totalCostUsd + record.totalCostUsd,
        apiCalls: acc.apiCalls + record.apiCalls,
      }),
      { agentCount: 0, taskCount: 0, totalTokens: 0, totalCostUsd: 0, apiCalls: 0 }
    );

    return secureResponse(
      NextResponse.json({
        period,
        daily,
        totals,
        source: 'aggregated',
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
