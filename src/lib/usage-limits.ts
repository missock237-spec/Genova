// Usage Limits Engine — Plan-based limits for concurrent agents, total agents, and daily tokens
import { db } from '@/lib/db';

export interface PlanLimits {
  maxAgents: number;
  maxConcurrent: number;
  maxTokensPerDay: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    maxAgents: 3,
    maxConcurrent: 1,
    maxTokensPerDay: 50000,
  },
  pro: {
    maxAgents: 20,
    maxConcurrent: 5,
    maxTokensPerDay: 500000,
  },
};

/**
 * Get limits for a given plan.
 * Falls back to free plan limits if plan is unknown.
 */
export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

/**
 * Count currently active agents for a user.
 */
export async function getActiveAgentCount(userId: string): Promise<number> {
  return db.agent.count({
    where: { userId, status: 'active' },
  });
}

/**
 * Count total agents (all statuses) for a user.
 */
export async function getTotalAgentCount(userId: string): Promise<number> {
  return db.agent.count({
    where: { userId },
  });
}

/**
 * Get today's total token usage for a user from AICost records.
 */
export async function getDailyTokenUsage(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await db.aICost.aggregate({
    where: {
      userId,
      createdAt: { gte: startOfDay },
    },
    _sum: { totalTokens: true },
  });

  return result._sum.totalTokens || 0;
}

/**
 * Check if a user can activate another concurrent agent.
 * Multi-agent system is exempt when `isMultiAgent` is true.
 */
export async function checkConcurrentAgents(
  userId: string,
  plan: string,
  isMultiAgent: boolean = false
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getPlanLimits(plan);

  // Multi-agent system is exempt from concurrent limits
  if (isMultiAgent) {
    return { allowed: true, current: 0, limit: -1 };
  }

  const current = await getActiveAgentCount(userId);
  return {
    allowed: current < limits.maxConcurrent,
    current,
    limit: limits.maxConcurrent,
  };
}

/**
 * Check if a user has reached their total agent limit.
 */
export async function checkAgentLimit(
  userId: string,
  plan: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getPlanLimits(plan);
  const current = await getTotalAgentCount(userId);
  return {
    allowed: current < limits.maxAgents,
    current,
    limit: limits.maxAgents,
  };
}

/**
 * Check if a user has reached their daily token limit.
 */
export async function checkTokenLimit(
  userId: string,
  plan: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = getPlanLimits(plan);
  const current = await getDailyTokenUsage(userId);
  return {
    allowed: current < limits.maxTokensPerDay,
    current,
    limit: limits.maxTokensPerDay,
  };
}

export type AgentAction = 'activate' | 'create' | 'chat';

export interface AgentActionValidation {
  allowed: boolean;
  reason?: string;
  upgradeMessage?: string;
}

/**
 * General validation for agent actions based on plan limits.
 */
export async function validateAgentAction(
  userId: string,
  plan: string,
  action: AgentAction,
  isMultiAgent: boolean = false
): Promise<AgentActionValidation> {
  const limits = getPlanLimits(plan);
  const planLabel = plan === 'pro' ? 'Pro' : 'Free';

  switch (action) {
    case 'activate': {
      const check = await checkConcurrentAgents(userId, plan, isMultiAgent);
      if (!check.allowed) {
        return {
          allowed: false,
          reason: `Concurrent agent limit reached (${check.current}/${check.limit}). ${planLabel} plan allows a maximum of ${check.limit} concurrent active agent${check.limit > 1 ? 's' : ''}.`,
          upgradeMessage:
            plan === 'free'
              ? 'Upgrade to Pro for up to 5 concurrent agents.'
              : 'You have reached the maximum concurrent agents for your plan.',
        };
      }
      return { allowed: true };
    }

    case 'create': {
      const check = await checkAgentLimit(userId, plan);
      if (!check.allowed) {
        return {
          allowed: false,
          reason: `Agent limit reached (${check.current}/${check.limit}). ${planLabel} plan allows a maximum of ${check.limit} agent${check.limit > 1 ? 's' : ''}.`,
          upgradeMessage:
            plan === 'free'
              ? 'Upgrade to Pro for up to 20 agents.'
              : 'You have reached the maximum agents for your plan.',
        };
      }
      return { allowed: true };
    }

    case 'chat': {
      const check = await checkTokenLimit(userId, plan);
      if (!check.allowed) {
        return {
          allowed: false,
          reason: `Daily token limit reached (${check.current.toLocaleString()}/${check.limit.toLocaleString()}). ${planLabel} plan allows ${check.limit.toLocaleString()} tokens per day.`,
          upgradeMessage:
            plan === 'free'
              ? 'Upgrade to Pro for 500,000 tokens per day.'
              : 'You have reached your daily token limit. Limit resets at midnight.',
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}
