/**
 * Usage Metering — Real-time Usage Tracking & Quota Management
 *
 * Tracks per-resource usage, aggregates for billing periods,
 * and enforces quota limits based on plan tiers.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getPlanLimit, getPlan, type PlanTier } from './plans';

const log = createLogger('usage-meter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UsageResource = 'agents' | 'tasks' | 'storage' | 'apiCalls' | 'teamMembers' | 'scheduledTasks' | 'webMonitors' | 'reports';
export type BillingPeriod = 'daily' | 'weekly' | 'monthly';

export interface UsageRecord {
  resource: UsageResource;
  used: number;
  limit: number;
  percentage: number;
  exceeded: boolean;
}

export interface UsageSummary {
  userId: string;
  plan: PlanTier;
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  resources: UsageRecord[];
  totalCreditsUsed: number;
  totalCreditsRemaining: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource: UsageResource;
  used: number;
  limit: number;
  remaining: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Record a usage event
 */
export async function recordUsage(
  userId: string,
  resource: UsageResource,
  amount: number = 1,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Update daily usage aggregation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingDaily = await db.usageDaily.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  if (existingDaily) {
    const updateData: Record<string, number> = {};
    switch (resource) {
      case 'tasks':
        updateData.taskCount = existingDaily.taskCount + amount;
        break;
      case 'apiCalls':
        updateData.apiCalls = existingDaily.apiCalls + amount;
        break;
      default:
        // For other resources, just update task count as a proxy
        updateData.taskCount = existingDaily.taskCount + 0; // No increment for non-task
        break;
    }

    await db.usageDaily.update({
      where: { id: existingDaily.id },
      data: updateData,
    });
  } else {
    await db.usageDaily.create({
      data: {
        userId,
        date: today,
        agentCount: 0,
        taskCount: resource === 'tasks' ? amount : 0,
        totalTokens: 0,
        totalCostUsd: 0,
        apiCalls: resource === 'apiCalls' ? amount : 0,
      },
    });
  }

  // Also create an activity log entry
  await db.activityLog.create({
    data: {
      action: `usage_${resource}`,
      details: JSON.stringify({ amount, ...metadata }),
      category: 'usage',
      userId,
    },
  }).catch(() => {
    // Non-critical — don't fail if activity log fails
  });

  log.debug('Usage recorded', { userId, resource, amount });
}

/**
 * Get usage for a specific billing period
 */
export async function getUsageForPeriod(
  userId: string,
  period: BillingPeriod = 'monthly'
): Promise<UsageSummary> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const planId = (user?.plan as PlanTier) || 'free';
  const plan = getPlan(planId);

  const periodDates = getPeriodDates(period);
  const resources = await getResourceUsage(userId, planId, periodDates);

  // Get credit usage
  const creditUsage = await db.creditTransaction.aggregate({
    where: {
      userId,
      type: 'usage',
      createdAt: { gte: periodDates.start, lte: periodDates.end },
    },
    _sum: { amount: true },
  });

  const totalCreditsUsed = Math.abs(creditUsage._sum.amount || 0);

  // Get remaining credits
  const { getCreditBalance } = await import('./credits');
  const balance = await getCreditBalance(userId);
  const totalCreditsRemaining = balance === -1 ? -1 : Math.max(0, balance);

  return {
    userId,
    plan: planId,
    period: {
      start: periodDates.start,
      end: periodDates.end,
      label: periodDates.label,
    },
    resources,
    totalCreditsUsed,
    totalCreditsRemaining,
  };
}

/**
 * Check if a quota allows an action
 */
export async function checkQuota(
  userId: string,
  resource: UsageResource,
  requestedAmount: number = 1
): Promise<QuotaCheckResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const planId = (user?.plan as PlanTier) || 'free';
  const limit = getPlanLimit(planId, resource);

  // Unlimited
  if (limit === -1) {
    return {
      allowed: true,
      resource,
      used: 0,
      limit: -1,
      remaining: -1,
    };
  }

  // Get current usage
  const used = await getCurrentUsage(userId, resource);
  const remaining = Math.max(0, limit - used);
  const allowed = used + requestedAmount <= limit;

  return {
    allowed,
    resource,
    used,
    limit,
    remaining,
    message: allowed ? undefined : `Quota exceeded: ${resource} (${used}/${limit})`,
  };
}

/**
 * Get current usage for a specific resource
 */
async function getCurrentUsage(userId: string, resource: UsageResource): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  switch (resource) {
    case 'agents': {
      return db.agent.count({ where: { userId } });
    }
    case 'tasks': {
      return db.task.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      });
    }
    case 'scheduledTasks': {
      return db.scheduledTask.count({
        where: { userId, status: 'active' },
      });
    }
    case 'webMonitors': {
      return db.scheduledTask.count({
        where: { userId, status: 'active', payload: { contains: 'monitor_web' } },
      });
    }
    case 'reports': {
      return db.scheduledTask.count({
        where: { userId, status: 'active', payload: { contains: 'auto_report' } },
      });
    }
    case 'apiCalls': {
      const result = await db.usageDaily.aggregate({
        where: { userId, date: { gte: startOfMonth } },
        _sum: { apiCalls: true },
      });
      return result._sum.apiCalls || 0;
    }
    case 'storage': {
      // Approximate storage from document sizes
      const result = await db.document.aggregate({
        where: { userId },
        _sum: { fileSize: true },
      });
      return Math.round((result._sum.fileSize || 0) / (1024 * 1024)); // Convert to MB
    }
    case 'teamMembers': {
      return db.workspaceMember.count({
        where: {
          user: { id: userId },
          status: 'active',
        },
      });
    }
    default:
      return 0;
  }
}

/**
 * Get usage for all resources for a user
 */
async function getResourceUsage(
  userId: string,
  planId: PlanTier,
  periodDates: { start: Date; end: Date }
): Promise<UsageRecord[]> {
  const resources: UsageResource[] = ['agents', 'tasks', 'scheduledTasks', 'webMonitors', 'reports', 'apiCalls', 'storage', 'teamMembers'];
  const records: UsageRecord[] = [];

  for (const resource of resources) {
    const limit = getPlanLimit(planId, resource);
    if (limit === 0) continue; // Skip unavailable features

    const used = await getCurrentUsage(userId, resource);
    const effectiveLimit = limit === -1 ? Infinity : limit;
    const percentage = effectiveLimit === Infinity ? 0 : Math.min(100, (used / effectiveLimit) * 100);

    records.push({
      resource,
      used,
      limit,
      percentage,
      exceeded: effectiveLimit !== Infinity && used >= effectiveLimit,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPeriodDates(period: BillingPeriod): {
  start: Date;
  end: Date;
  label: string;
} {
  const now = new Date();
  const end = new Date(now);

  switch (period) {
    case 'daily': {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      return { start, end, label: 'Last 24 hours' };
    }
    case 'weekly': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end, label: 'Last 7 days' };
    }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end, label: `Current month (${start.toLocaleDateString()} - now)` };
    }
  }
}

/**
 * Get usage trends over time
 */
export async function getUsageTrends(
  userId: string,
  days: number = 30
): Promise<Array<{
  date: string;
  tasks: number;
  apiCalls: number;
  cost: number;
  tokens: number;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const dailyUsage = await db.usageDaily.findMany({
    where: {
      userId,
      date: { gte: startDate },
    },
    orderBy: { date: 'asc' },
  });

  return dailyUsage.map((d) => ({
    date: d.date.toISOString().split('T')[0],
    tasks: d.taskCount,
    apiCalls: d.apiCalls,
    cost: d.totalCostUsd,
    tokens: d.totalTokens,
  }));
}

/**
 * Get aggregated usage stats
 */
export async function getUsageStats(userId: string): Promise<{
  totalAgents: number;
  totalTasks: number;
  totalScheduledTasks: number;
  totalWebMonitors: number;
  totalReports: number;
  monthlyApiCalls: number;
  monthlyCost: number;
  monthlyTokens: number;
}> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalAgents,
    totalTasks,
    totalScheduledTasks,
    totalWebMonitors,
    totalReports,
    monthlyAgg,
    monthlyCosts,
  ] = await Promise.all([
    db.agent.count({ where: { userId } }),
    db.task.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
    db.scheduledTask.count({ where: { userId, status: 'active' } }),
    db.scheduledTask.count({ where: { userId, status: 'active', payload: { contains: 'monitor_web' } } }),
    db.scheduledTask.count({ where: { userId, status: 'active', payload: { contains: 'auto_report' } } }),
    db.usageDaily.aggregate({
      where: { userId, date: { gte: startOfMonth } },
      _sum: { apiCalls: true, totalTokens: true, totalCostUsd: true },
    }),
    db.aICost.aggregate({
      where: { userId, createdAt: { gte: startOfMonth } },
      _sum: { costUsd: true },
    }),
  ]);

  return {
    totalAgents,
    totalTasks,
    totalScheduledTasks,
    totalWebMonitors,
    totalReports,
    monthlyApiCalls: monthlyAgg._sum.apiCalls || 0,
    monthlyCost: monthlyCosts._sum.costUsd || 0,
    monthlyTokens: monthlyAgg._sum.totalTokens || 0,
  };
}
