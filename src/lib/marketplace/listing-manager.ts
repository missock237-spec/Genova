/**
 * Listing Manager — CRUD for marketplace listings
 *
 * Manages agents, workflows, templates for the AI marketplace.
 * Supports categories, tags, search, filtering, version management.
 */

import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListingType = 'agent' | 'workflow' | 'template' | 'plugin';
export type ListingStatus = 'draft' | 'published' | 'archived' | 'suspended';
export type ListingCategory = 'general' | 'productivity' | 'development' | 'marketing' | 'sales' | 'support' | 'research' | 'finance' | 'hr' | 'creative';

export interface CreateListingOptions {
  type: ListingType;
  name: string;
  description: string;
  category?: ListingCategory;
  tags?: string[];
  price?: number;
  currency?: string;
  config?: Record<string, unknown>;
  previewUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateListingOptions {
  name?: string;
  description?: string;
  category?: ListingCategory;
  tags?: string[];
  price?: number;
  currency?: string;
  config?: Record<string, unknown>;
  previewUrl?: string;
  status?: ListingStatus;
  metadata?: Record<string, unknown>;
}

export interface SearchListingsOptions {
  query?: string;
  type?: ListingType;
  category?: ListingCategory;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  status?: ListingStatus;
  sortBy?: 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc';
  page?: number;
  limit?: number;
}

export interface MarketplaceListingResult {
  id: string;
  userId: string;
  type: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  currency: string;
  config: Record<string, unknown>;
  previewUrl: string | null;
  downloads: number;
  rating: number;
  reviewCount: number;
  status: string;
  metadata: Record<string, unknown>;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author?: { name: string; avatar: string | null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80) + '-' + Math.random().toString(36).substring(2, 8);
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function serializeListing(listing: {
  id: string;
  userId: string;
  type: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string;
  price: number;
  currency: string;
  config: string;
  previewUrl: string | null;
  downloads: number;
  rating: number;
  reviewCount: number;
  status: string;
  metadata: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { name: string; avatar: string | null };
}): MarketplaceListingResult {
  return {
    id: listing.id,
    userId: listing.userId,
    type: listing.type,
    name: listing.name,
    slug: listing.slug,
    description: listing.description,
    category: listing.category,
    tags: safeParse<string[]>(listing.tags, []),
    price: listing.price,
    currency: listing.currency,
    config: safeParse<Record<string, unknown>>(listing.config, {}),
    previewUrl: listing.previewUrl,
    downloads: listing.downloads,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    status: listing.status,
    metadata: safeParse<Record<string, unknown>>(listing.metadata, {}),
    publishedAt: listing.publishedAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    author: listing.user ? { name: listing.user.name, avatar: listing.user.avatar } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Core: Create Listing
// ---------------------------------------------------------------------------

export async function createListing(
  userId: string,
  options: CreateListingOptions
): Promise<MarketplaceListingResult> {
  const slug = generateSlug(options.name);

  const listing = await db.marketplaceListing.create({
    data: {
      userId,
      type: options.type,
      name: options.name,
      slug,
      description: options.description,
      category: options.category || 'general',
      tags: JSON.stringify(options.tags || []),
      price: options.price || 0,
      currency: options.currency || 'usd',
      config: JSON.stringify(options.config || {}),
      previewUrl: options.previewUrl || null,
      metadata: JSON.stringify({
        ...(options.metadata || {}),
        version: '1.0.0',
        changelog: [],
      }),
      status: 'draft',
    },
    include: { user: { select: { name: true, avatar: true } } },
  });

  return serializeListing(listing);
}

// ---------------------------------------------------------------------------
// Core: Update Listing
// ---------------------------------------------------------------------------

export async function updateListing(
  userId: string,
  listingId: string,
  options: UpdateListingOptions
): Promise<MarketplaceListingResult> {
  const existing = await db.marketplaceListing.findFirst({
    where: { id: listingId, userId },
  });

  if (!existing) throw new Error('Listing not found or not authorized');

  const data: Record<string, unknown> = {};
  if (options.name !== undefined) data.name = options.name;
  if (options.description !== undefined) data.description = options.description;
  if (options.category !== undefined) data.category = options.category;
  if (options.tags !== undefined) data.tags = JSON.stringify(options.tags);
  if (options.price !== undefined) data.price = options.price;
  if (options.currency !== undefined) data.currency = options.currency;
  if (options.config !== undefined) data.config = JSON.stringify(options.config);
  if (options.previewUrl !== undefined) data.previewUrl = options.previewUrl;
  if (options.status !== undefined) data.status = options.status;
  if (options.metadata !== undefined) {
    const currentMeta = safeParse<Record<string, unknown>>(existing.metadata, {});
    data.metadata = JSON.stringify({ ...currentMeta, ...options.metadata });
  }

  if (options.status === 'published' && existing.status !== 'published') {
    data.publishedAt = new Date();
  }

  const listing = await db.marketplaceListing.update({
    where: { id: listingId },
    data,
    include: { user: { select: { name: true, avatar: true } } },
  });

  return serializeListing(listing);
}

// ---------------------------------------------------------------------------
// Core: Publish Listing
// ---------------------------------------------------------------------------

export async function publishListing(
  userId: string,
  listingId: string
): Promise<MarketplaceListingResult> {
  return updateListing(userId, listingId, { status: 'published' });
}

// ---------------------------------------------------------------------------
// Core: Search Listings
// ---------------------------------------------------------------------------

export async function searchListings(
  options: SearchListingsOptions = {}
): Promise<{ listings: MarketplaceListingResult[]; total: number; page: number; totalPages: number }> {
  const {
    query,
    type,
    category,
    tags,
    minPrice,
    maxPrice,
    status = 'published',
    sortBy = 'newest',
    page = 1,
    limit = 20,
  } = options;

  const where: Record<string, unknown> = { status };

  if (type) where.type = type;
  if (category) where.category = category;

  if (query) {
    where.OR = [
      { name: { contains: query } },
      { description: { contains: query } },
    ];
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    where.price = priceFilter;
  }

  if (tags && tags.length > 0) {
    where.AND = tags.map((tag) => ({
      tags: { contains: tag },
    }));
  }

  let orderBy: Record<string, string>[];
  switch (sortBy) {
    case 'popular':
      orderBy = [{ downloads: 'desc' }, { rating: 'desc' }];
      break;
    case 'rating':
      orderBy = [{ rating: 'desc' }, { reviewCount: 'desc' }];
      break;
    case 'price_asc':
      orderBy = [{ price: 'asc' }];
      break;
    case 'price_desc':
      orderBy = [{ price: 'desc' }];
      break;
    case 'newest':
    default:
      orderBy = [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
  }

  const [listings, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { name: true, avatar: true } } },
    }),
    db.marketplaceListing.count({ where }),
  ]);

  return {
    listings: listings.map(serializeListing),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ---------------------------------------------------------------------------
// Core: Get Listing by ID
// ---------------------------------------------------------------------------

export async function getListing(
  listingId: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { user: { select: { name: true, avatar: true } } },
  });

  return listing ? serializeListing(listing) : null;
}

// ---------------------------------------------------------------------------
// Core: Delete Listing
// ---------------------------------------------------------------------------

export async function deleteListing(
  userId: string,
  listingId: string
): Promise<boolean> {
  const listing = await db.marketplaceListing.findFirst({
    where: { id: listingId, userId },
  });

  if (!listing) return false;

  await db.marketplaceListing.delete({ where: { id: listingId } });
  return true;
}

// ---------------------------------------------------------------------------
// Core: Increment downloads
// ---------------------------------------------------------------------------

export async function incrementDownloads(listingId: string): Promise<void> {
  await db.marketplaceListing.update({
    where: { id: listingId },
    data: { downloads: { increment: 1 } },
  });
}
