// Budget Controller — limite les actions des agents par quota
// Empeche un agent de consommer toutes les ressources ou d'epuiser les API

import { prisma } from '@/lib/prisma';

interface AgentBudget {
  agentId: string;
  userId: string;   // propriétaire de l'agent (pour admin free-tier check)
  plan: string;      // plan du propriétaire (free/pro/enterprise/admin)
  dailyActions: number;
  dailyTokens: number;
  dailyCost: number;
  monthlyCost: number;
  maxDailyActions: number;
  maxDailyTokens: number;
  maxDailyCost: number;
  maxMonthlyCost: number;
}

interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  budget: AgentBudget;
}

const BUDGET_CACHE = new Map<string, { budget: AgentBudget; expiresAt: number }>();
const CACHE_TTL = 30000;

const DEFAULT_LIMITS = {
  free: { dailyActions: 100, dailyTokens: 50000, dailyCost: 0.01, monthlyCost: 0.30 },
  pro: { dailyActions: 1000, dailyTokens: 500000, dailyCost: 0.10, monthlyCost: 3.00 },
  enterprise: { dailyActions: 10000, dailyTokens: 5000000, dailyCost: 1.00, monthlyCost: 30.00 },
};

async function getAgentBudget(agentId: string): Promise<AgentBudget> {
  const cached = BUDGET_CACHE.get(agentId);
  if (cached && cached.expiresAt > Date.now()) return cached.budget;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });
  if (!agent) throw new Error('Agent non trouve');

  const user = await prisma.user.findUnique({
    where: { id: agent.userId },
    select: { plan: true },
  });
  const plan = (user?.plan as keyof typeof DEFAULT_LIMITS) || 'free';
  const limits = DEFAULT_LIMITS[plan] || DEFAULT_LIMITS.free;

  const [dailyActions, dailyTokens, dailyCostAgg, monthlyCostAgg] = await Promise.all([
    prisma.agentActionLog.count({
      where: { agentId, createdAt: { gte: todayStart } },
    }),
    prisma.agentUsage.aggregate({
      where: { agentId, createdAt: { gte: todayStart } },
      _sum: { tokensUsed: true },
    }),
    prisma.aiCost.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { costUsd: true },
    }),
    prisma.aiCost.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costUsd: true },
    }),
  ]);

  const budget: AgentBudget = {
    agentId,
    userId: agent.userId,
    plan,
    dailyActions,
// @ts-ignore — type narrowing pending, see refactor ticket
    dailyTokens: dailyTokens._sum.tokensUsed || 0,
// @ts-ignore — type narrowing pending, see refactor ticket
    dailyCost: dailyCostAgg._sum.costUsd || 0,
// @ts-ignore — type narrowing pending, see refactor ticket
    monthlyCost: monthlyCostAgg._sum.costUsd || 0,
    maxDailyActions: limits.dailyActions,
    maxDailyTokens: limits.dailyTokens,
    maxDailyCost: limits.dailyCost,
    maxMonthlyCost: limits.monthlyCost,
  };

  BUDGET_CACHE.set(agentId, { budget, expiresAt: Date.now() + CACHE_TTL });
  return budget;
}

export async function checkBudget(agentId: string): Promise<BudgetCheck> {
  try {
    const budget = await getAgentBudget(agentId);

    // ADMIN FREE-TIER OVERRIDE :
    // Si l'agent appartient à un compte admin master (isGen3iaAdminFreeTier=true),
    // tous les quotas/budgets sont illimités — toutes les fonctionnalités du
    // projet sont gratuites pour ce compte.
    try {
      const { isUidAdminFreeTier } = await import('@/lib/admin-account');
      if (await isUidAdminFreeTier(budget.userId)) {
        return { allowed: true, budget };
      }
    } catch {
      // admin-account module failed to load — fall through to normal checks
    }

    if (budget.dailyActions >= budget.maxDailyActions) {
      return {
        allowed: false,
        reason: 'Limite quotidienne d\'actions atteinte (' + budget.dailyActions + '/' + budget.maxDailyActions + ')',
        budget,
      };
    }

    if (budget.dailyTokens >= budget.maxDailyTokens) {
      return {
        allowed: false,
        reason: 'Limite quotidienne de tokens atteinte (' + budget.dailyTokens + '/' + budget.maxDailyTokens + ')',
        budget,
      };
    }

    if (budget.dailyCost >= budget.maxDailyCost) {
      return {
        allowed: false,
        reason: 'Budget quotidien epuise ($' + budget.dailyCost.toFixed(4) + '/$' + budget.maxDailyCost.toFixed(2) + ')',
        budget,
      };
    }

    if (budget.monthlyCost >= budget.maxMonthlyCost) {
      return {
        allowed: false,
        reason: 'Budget mensuel epuise ($' + budget.monthlyCost.toFixed(4) + '/$' + budget.maxMonthlyCost.toFixed(2) + ')',
        budget,
      };
    }

    return { allowed: true, budget };
  } catch (error) {
    // En cas d'erreur, autoriser par defaut mais logger
    console.error('[Budget] Erreur verification:', error);
    return {
      allowed: true,
      budget: {
        agentId, userId: '', plan: 'free', dailyActions: 0, dailyTokens: 0, dailyCost: 0, monthlyCost: 0,
        maxDailyActions: 100, maxDailyTokens: 50000, maxDailyCost: 0.01, maxMonthlyCost: 0.30,
      },
    };
  }
}

export async function getAgentBudgetStatus(agentId: string): Promise<AgentBudget | null> {
  try {
    return await getAgentBudget(agentId);
  } catch {
    return null;
  }
}

export function invalidateBudgetCache(agentId: string): void {
  BUDGET_CACHE.delete(agentId);
}

export function updateLimits(plan: string, limits: Partial<typeof DEFAULT_LIMITS.free>): void {
  if (DEFAULT_LIMITS[plan as keyof typeof DEFAULT_LIMITS]) {
    Object.assign(DEFAULT_LIMITS[plan as keyof typeof DEFAULT_LIMITS], limits);
  }
}
