import { db } from '@/lib/db';

interface TrackAgentUsageParams {
  agentId: string;
  userId: string;
  action: string;
  tokensUsed?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
  status?: string;
}

export async function trackAgentUsage(params: TrackAgentUsageParams): Promise<void> {
  const { agentId, userId, action, tokensUsed = 0, duration = 0, metadata = {}, status = 'success' } = params;

  await db.agentUsage.create({
    data: {
      agentId,
      userId,
      action,
      tokensUsed,
      duration,
      status,
      metadata: JSON.stringify(metadata),
    },
  });
}

interface TrackAICostParams {
  userId: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  requestId?: string;
  agentId?: string;
}

export async function trackAICost(params: TrackAICostParams): Promise<void> {
  const {
    userId,
    provider,
    model,
    promptTokens = 0,
    completionTokens = 0,
    costUsd = 0,
    requestId,
    agentId,
  } = params;

  await db.aICost.create({
    data: {
      userId,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      requestId,
      agentId,
    },
  });
}

export async function aggregateDailyUsage(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Aggregate agent usage for today
  const agentUsageAgg = await db.agentUsage.aggregate({
    where: {
      userId,
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    },
    _sum: {
      tokensUsed: true,
    },
    _count: true,
  });

  // Count distinct agents used today
  const distinctAgents = await db.agentUsage.findMany({
    where: {
      userId,
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    },
    select: { agentId: true },
    distinct: ['agentId'],
  });

  // Aggregate AI costs for today
  const costAgg = await db.aICost.aggregate({
    where: {
      userId,
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    },
    _sum: {
      costUsd: true,
      totalTokens: true,
    },
    _count: true,
  });

  // Count tasks created today
  const taskCount = await db.task.count({
    where: {
      userId,
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    },
  });

  // Upsert the daily usage record
  await db.usageDaily.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    create: {
      userId,
      date: today,
      agentCount: distinctAgents.length,
      taskCount,
      totalTokens: (agentUsageAgg._sum.tokensUsed || 0) + (costAgg._sum.totalTokens || 0),
      totalCostUsd: costAgg._sum.costUsd || 0,
      apiCalls: agentUsageAgg._count + costAgg._count,
    },
    update: {
      agentCount: distinctAgents.length,
      taskCount,
      totalTokens: (agentUsageAgg._sum.tokensUsed || 0) + (costAgg._sum.totalTokens || 0),
      totalCostUsd: costAgg._sum.costUsd || 0,
      apiCalls: agentUsageAgg._count + costAgg._count,
    },
  });
}

interface LogMonitoringEventParams {
  userId: string;
  eventType: string;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  severity?: string;
}

export async function logMonitoringEvent(params: LogMonitoringEventParams): Promise<void> {
  const { userId, eventType, source, message, details = {}, severity = 'info' } = params;

  await db.monitoringEvent.create({
    data: {
      userId,
      eventType,
      source,
      message,
      details: JSON.stringify(details),
      severity,
    },
  });
}
