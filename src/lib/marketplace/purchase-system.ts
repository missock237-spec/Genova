/**
 * Purchase System — Free marketplace listings
 *
 * Features:
 * - All listings are free
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
  price: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
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
// Core: Purchase Listing (Free)
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
    where: { userId_listingId: { listingId, userId } },
  });

  if (existingPurchase) {
    // Already purchased — return existing purchase
    return {
      id: existingPurchase.id,
      listingId: existingPurchase.listingId,
      userId: existingPurchase.userId,
      price: existingPurchase.price,
      currency: existingPurchase.currency,
      status: existingPurchase.status,
      metadata: safeParse<Record<string, unknown>>(existingPurchase.metadata, {}),
      createdAt: existingPurchase.createdAt,
      listing: {
        name: listing.name,
        type: listing.type,
        config: safeParse<Record<string, unknown>>(listing.config, {}),
      },
    };
  }

  // Everything is free — complete purchase immediately
  const purchase = await db.marketplacePurchase.create({
    data: {
      listingId,
      userId,
      price: 0,
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
    price: purchase.price,
    currency: purchase.currency,
    status: purchase.status,
    metadata: safeParse<Record<string, unknown>>(purchase.metadata, {}),
    createdAt: purchase.createdAt,
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
    where: { userId_listingId: { listingId, userId } },
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
      orderBy: { createdAt: 'desc' },
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
      price: p.price,
      currency: p.currency,
      status: p.status,
      metadata: safeParse<Record<string, unknown>>(p.metadata, {}),
      createdAt: p.createdAt,
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
