/**
 * Purchase System — Free and paid listings, credit-based purchases
 *
 * Features:
 * - Free and paid listing purchases
 * - Credit-based purchases
 * - License management, download tracking
 * - Purchase verification and history
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseOptions {
  listingId: string;
  userId: string;
}

export interface PurchaseResult {
  id: string;
  listingId: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown>;
  purchasedAt: Date;
  listing?: {
    name: string;
    type: string;
    config: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Core: Purchase Listing
// ---------------------------------------------------------------------------

export async function purchaseListing(options: PurchaseOptions): Promise<PurchaseResult> {
  const { listingId, userId } = options;

  // Check listing exists and is published
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  });

  if (!listing) throw new Error('Listing not found');
  if (listing.status !== 'published') throw new Error('Listing is not available for purchase');
  if (listing.userId === userId) throw new Error('Cannot purchase your own listing');

  // Check if already purchased
  const existingPurchase = await db.marketplacePurchase.findUnique({
    where: { listingId_userId: { listingId, userId } },
  });

  if (existingPurchase) {
    // Already purchased — return existing purchase
    return {
      id: existingPurchase.id,
      listingId: existingPurchase.listingId,
      userId: existingPurchase.userId,
      amount: existingPurchase.amount,
      currency: existingPurchase.currency,
      status: existingPurchase.status,
      metadata: safeParse<Record<string, unknown>>(existingPurchase.metadata, {}),
      purchasedAt: existingPurchase.purchasedAt,
      listing: {
        name: listing.name,
        type: listing.type,
        config: safeParse<Record<string, unknown>>(listing.config, {}),
      },
    };
  }

  const amount = listing.price;

  // For free listings, complete purchase immediately
  if (amount === 0) {
    const purchase = await db.marketplacePurchase.create({
      data: {
        listingId,
        userId,
        amount: 0,
        currency: listing.currency,
        status: 'completed',
        metadata: JSON.stringify({ type: 'free', license: 'standard' }),
      },
    });

    // Increment download count
    await db.marketplaceListing.update({
      where: { id: listingId },
      data: { downloads: { increment: 1 } },
    });

    return {
      id: purchase.id,
      listingId: purchase.listingId,
      userId: purchase.userId,
      amount: purchase.amount,
      currency: purchase.currency,
      status: purchase.status,
      metadata: safeParse<Record<string, unknown>>(purchase.metadata, {}),
      purchasedAt: purchase.purchasedAt,
      listing: {
        name: listing.name,
        type: listing.type,
        config: safeParse<Record<string, unknown>>(listing.config, {}),
      },
    };
  }

  // For paid listings, check user credits
  const creditBalance = await getUserCreditBalance(userId);

  if (creditBalance < amount) {
    throw new Error('Insufficient credits to complete purchase');
  }

  // Deduct credits
  await deductCredits(userId, amount, listingId, `Purchase: ${listing.name}`);

  // Create purchase record
  const purchase = await db.marketplacePurchase.create({
    data: {
      listingId,
      userId,
      amount,
      currency: listing.currency,
      status: 'completed',
      metadata: JSON.stringify({
        type: 'credit_purchase',
        license: 'standard',
        creditsUsed: amount,
      }),
    },
  });

  // Increment download count
  await db.marketplaceListing.update({
    where: { id: listingId },
    data: { downloads: { increment: 1 } },
  });

  return {
    id: purchase.id,
    listingId: purchase.listingId,
    userId: purchase.userId,
    amount: purchase.amount,
    currency: purchase.currency,
    status: purchase.status,
    metadata: safeParse<Record<string, unknown>>(purchase.metadata, {}),
    purchasedAt: purchase.purchasedAt,
    listing: {
      name: listing.name,
      type: listing.type,
      config: safeParse<Record<string, unknown>>(listing.config, {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Core: Verify Access
// ---------------------------------------------------------------------------

export async function verifyAccess(userId: string, listingId: string): Promise<boolean> {
  // Owner always has access
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { userId: true, price: true },
  });

  if (!listing) return false;
  if (listing.userId === userId) return true;

  // Free listings are accessible to all
  if (listing.price === 0) return true;

  // Check purchase record
  const purchase = await db.marketplacePurchase.findUnique({
    where: { listingId_userId: { listingId, userId } },
  });

  return purchase !== null && purchase.status === 'completed';
}

// ---------------------------------------------------------------------------
// Core: Get Purchase History
// ---------------------------------------------------------------------------

export async function getPurchaseHistory(
  userId: string,
  options: { page?: number; limit?: number } = {}
): Promise<{ purchases: PurchaseResult[]; total: number; page: number; totalPages: number }> {
  const { page = 1, limit = 20 } = options;

  const [purchases, total] = await Promise.all([
    db.marketplacePurchase.findMany({
      where: { userId },
      orderBy: { purchasedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        listing: { select: { name: true, type: true, config: true } },
      },
    }),
    db.marketplacePurchase.count({ where: { userId } }),
  ]);

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      listingId: p.listingId,
      userId: p.userId,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      metadata: safeParse<Record<string, unknown>>(p.metadata, {}),
      purchasedAt: p.purchasedAt,
      listing: {
        name: p.listing.name,
        type: p.listing.type,
        config: safeParse<Record<string, unknown>>(p.listing.config, {}),
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Credit helpers
// ---------------------------------------------------------------------------

async function getUserCreditBalance(userId: string): Promise<number> {
  const latestTx = await db.creditTransaction.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { balance: true },
  });
  return latestTx?.balance || 0;
}

async function deductCredits(
  userId: string,
  amount: number,
  resourceId: string,
  description: string
): Promise<void> {
  const currentBalance = await getUserCreditBalance(userId);

  if (currentBalance < amount) {
    throw new Error('Insufficient credits');
  }

  await db.creditTransaction.create({
    data: {
      userId,
      amount: -amount,
      balance: currentBalance - amount,
      type: 'usage',
      resourceType: 'marketplace_purchase',
      resourceId,
      description,
      metadata: JSON.stringify({ marketplacePurchase: true }),
    },
  });
}
