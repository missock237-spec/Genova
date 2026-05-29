// Usage Limits Engine — Unlimited limits (free system)
// All limits are set to unlimited since the system is completely free.
import { db } from '@/lib/db';

export interface PlanLimits {
  maxAgents: number;
  maxConcurrent: number;
  maxTokensPerDay: number;
}

// Unlimited limits for all users
const UNLIMITED_LIMITS: PlanLimits = {
  maxAgents: -1,        // Unlimited
  maxConcurrent: -1,    // Unlimited
  maxTokensPerDay: -1,  // Unlimited
};

/**
 * Get limits for a given plan.
 * All users get unlimited access since the system is free.
 */
export function getPlanLimits(_plan: string): PlanLimits {
  return UNLIMITED_LIMITS;
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
 * Always allowed in free system.
 */
export async function checkConcurrentAgents(
  userId: string,
  _plan: string,
  _isMultiAgent: boolean = false
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const current = await getActiveAgentCount(userId);
  return {
    allowed: true,
    current,
    limit: -1,
  };
}

/**
 * Check if a user has reached their total agent limit.
 * Always allowed in free system.
 */
export async function checkAgentLimit(
  userId: string,
  _plan: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const current = await getTotalAgentCount(userId);
  return {
    allowed: true,
    current,
    limit: -1,
  };
}

/**
 * Check if a user has reached their daily token limit.
 * Always allowed in free system.
 */
export async function checkTokenLimit(
  userId: string,
  _plan: string
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const current = await getDailyTokenUsage(userId);
  return {
    allowed: true,
    current,
    limit: -1,
  };
}

export type AgentAction = 'activate' | 'create' | 'chat';

export interface AgentActionValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * General validation for agent actions.
 * Always allowed in free system — no restrictions.
 */
export async function validateAgentAction(
  userId: string,
  _plan: string,
  _action: AgentAction,
  _isMultiAgent: boolean = false
): Promise<AgentActionValidation> {
  return { allowed: true };
}
