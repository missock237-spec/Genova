/**
 * Credit System — AI Usage Credit Tracking & Management
 *
 * Track AI usage credits (tokens, images, videos, voice).
 * Credit packages: free (100), pro (5000), enterprise (unlimited).
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('credits');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditType = 'purchase' | 'usage' | 'refund' | 'bonus' | 'adjustment';
export type ResourceType = 'agent_run' | 'image_gen' | 'video_gen' | 'voice' | 'token' | 'credit_purchase' | 'plan_upgrade' | 'report_gen';

export interface CreditCheckResult {
  hasCredits: boolean;
  balance: number;
  required: number;
  shortfall?: number;
}

export interface DeductCreditsInput {
  userId: string;
  amount: number;
  resourceType: ResourceType;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AddCreditsInput {
  userId: string;
  amount: number;
  type: CreditType;
  resourceType: ResourceType;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageHistoryEntry {
  id: string;
  amount: number;
  balance: number;
  type: string;
  resourceType: string;
  description: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Credit Costs per Resource Type
// ---------------------------------------------------------------------------

export const CREDIT_COSTS: Record<ResourceType, number> = {
  agent_run: 5,        // 5 credits per agent run
  image_gen: 10,       // 10 credits per image
  video_gen: 50,       // 50 credits per video
  voice: 3,            // 3 credits per voice operation
  token: 1,            // 1 credit per 1K tokens
  credit_purchase: 0,  // No cost (adding credits)
  plan_upgrade: 0,     // No cost (bonus credits)
  report_gen: 2,       // 2 credits per report
};

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Check if user has enough credits
 */
export async function checkCredits(
  userId: string,
  requiredCredits: number
): Promise<CreditCheckResult> {
  const balance = await getCreditBalance(userId);

  if (balance === -1) {
    // Unlimited credits
    return { hasCredits: true, balance: -1, required: requiredCredits };
  }

  const hasCredits = balance >= requiredCredits;
  return {
    hasCredits,
    balance,
    required: requiredCredits,
    shortfall: hasCredits ? undefined : requiredCredits - balance,
  };
}

/**
 * Deduct credits from user's balance
 */
export async function deductCredits(input: DeductCreditsInput): Promise<{
  success: boolean;
  newBalance: number;
  transactionId: string;
}> {
  const balance = await getCreditBalance(input.userId);

  // Unlimited credits — always succeed
  if (balance === -1) {
    const transaction = await db.creditTransaction.create({
      data: {
        userId: input.userId,
        amount: -input.amount,
        balance: -1,
        type: 'usage',
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        description: input.description || `Used ${input.amount} credits for ${input.resourceType}`,
        metadata: JSON.stringify(input.metadata || {}),
      },
    });

    return { success: true, newBalance: -1, transactionId: transaction.id };
  }

  // Check if enough credits
  if (balance < input.amount) {
    log.warn('Insufficient credits', {
      userId: input.userId,
      balance,
      required: input.amount,
      resourceType: input.resourceType,
    });

    return { success: false, newBalance: balance, transactionId: '' };
  }

  const newBalance = balance - input.amount;

  const transaction = await db.creditTransaction.create({
    data: {
      userId: input.userId,
      amount: -input.amount,
      balance: newBalance,
      type: 'usage',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      description: input.description || `Used ${input.amount} credits for ${input.resourceType}`,
      metadata: JSON.stringify(input.metadata || {}),
    },
  });

  log.info('Credits deducted', {
    userId: input.userId,
    amount: input.amount,
    newBalance,
    resourceType: input.resourceType,
  });

  return { success: true, newBalance, transactionId: transaction.id };
}

/**
 * Add credits to user's balance
 */
export async function addCredits(input: AddCreditsInput): Promise<{
  newBalance: number;
  transactionId: string;
}> {
  const currentBalance = await getCreditBalance(input.userId);
  const newBalance = currentBalance === -1 ? -1 : currentBalance + input.amount;

  const transaction = await db.creditTransaction.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      balance: newBalance,
      type: input.type,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      description: input.description || `Added ${input.amount} credits (${input.type})`,
      metadata: JSON.stringify(input.metadata || {}),
    },
  });

  log.info('Credits added', {
    userId: input.userId,
    amount: input.amount,
    newBalance,
    type: input.type,
  });

  return { newBalance, transactionId: transaction.id };
}

/**
 * Get current credit balance for a user
 * Returns -1 for unlimited plans
 */
export async function getCreditBalance(userId: string): Promise<number> {
  // Check subscription for unlimited plans
  const subscription = await db.subscription.findFirst({
    where: { userId, status: 'active' },
    select: { plan: true },
  });

  if (subscription?.plan === 'enterprise') {
    return -1; // Unlimited
  }

  // Get the latest transaction balance
  const latestTransaction = await db.creditTransaction.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { balance: true },
  });

  return latestTransaction?.balance ?? 0;
}

/**
 * Get usage history for a user
 */
export async function getUsageHistory(
  userId: string,
  options?: {
    type?: CreditType;
    resourceType?: ResourceType;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{
  entries: UsageHistoryEntry[];
  total: number;
}> {
  const where: Record<string, unknown> = { userId };

  if (options?.type) where.type = options.type;
  if (options?.resourceType) where.resourceType = options.resourceType;
  if (options?.startDate || options?.endDate) {
    where.createdAt = {
      ...(options.startDate ? { gte: options.startDate } : {}),
      ...(options.endDate ? { lte: options.endDate } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    db.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    db.creditTransaction.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      balance: e.balance,
      type: e.type,
      resourceType: e.resourceType,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  };
}

/**
 * Initialize credits for a new user (free plan)
 */
export async function initializeUserCredits(userId: string): Promise<void> {
  const existing = await db.creditTransaction.findFirst({
    where: { userId },
  });

  if (existing) return; // Already initialized

  await addCredits({
    userId,
    amount: 100, // Free tier: 100 credits
    type: 'bonus',
    resourceType: 'plan_upgrade',
    description: 'Welcome bonus: 100 free credits',
    metadata: { plan: 'free' },
  });

  log.info('User credits initialized', { userId });
}

/**
 * Purchase credits package
 */
export async function purchaseCredits(
  userId: string,
  packageId: string
): Promise<{
  checkoutUrl: string;
  sessionId: string;
}> {
  const { CREDIT_PACKAGES } = await import('./plans');
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);

  if (!pkg) {
    throw new Error(`Invalid credit package: ${packageId}`);
  }

  // Create a Stripe checkout session for one-time payment
  const { createCheckoutSession } = await import('./stripe-client');

  const result = await createCheckoutSession({
    userId,
    priceId: pkg.stripePriceId,
    planId: 'credit_purchase',
    mode: 'payment',
  });

  // Store the credit amount in the session metadata (handled by stripe-client)
  log.info('Credit purchase initiated', {
    userId,
    packageId,
    credits: pkg.credits,
    price: pkg.price,
  });

  return {
    checkoutUrl: result.url,
    sessionId: result.sessionId,
  };
}
