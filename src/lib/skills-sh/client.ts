/**
 * skills.sh API Client
 * 
 * Connects to the skills.sh ecosystem (https://skills.sh) to discover and
 * retrieve agent skills. Uses Vercel OIDC authentication for API access.
 * Includes in-memory caching with TTL and graceful fallback for local dev.
 */

import { getVercelOidcToken } from '@vercel/oidc';

// ─── Types ────────────────────────────────────────────────────

export interface SkillsShSkill {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: string;
  installUrl: string;
  url: string;
}

export interface SkillsShSearchResult {
  data: SkillsShSkill[];
  query: string;
  searchType: 'fuzzy' | 'semantic';
  count: number;
  durationMs: number;
}

export interface SkillsShListResult {
  data: SkillsShSkill[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
}

export interface SkillsShDetailResult {
  data: SkillsShSkill & {
    files: Array<{
      path: string;
      content: string;
    }>;
  };
}

// ─── Cache ────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL = {
  search: 5 * 60 * 1000,       // 5 min
  list: 10 * 60 * 1000,        // 10 min
  detail: 30 * 60 * 1000,      // 30 min
  curated: 15 * 60 * 1000,    // 15 min
} as const;

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });

  // Evict oldest entries if cache grows too large
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

// ─── Auth ─────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  try {
    // @vercel/oidc handles request-scoped tokens and auto-refresh.
    // Works locally with Vercel CLI linked, works in production via env.
    const token = await getVercelOidcToken();
    return token || null;
  } catch {
    // Fallback: direct env var (no auto-refresh, but works in production)
    const envToken = process.env.VERCEL_OIDC_TOKEN;
    if (envToken) return envToken;
    return null;
  }
}

// ─── Fetch wrapper ────────────────────────────────────────────

const BASE_URL = 'https://skills.sh/api/v1';

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error(
      'skills.sh API requires Vercel OIDC authentication. ' +
      'Ensure this project is deployed on Vercel with OIDC enabled, ' +
      'or run `vercel env pull` locally.'
    );
  }

  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `skills.sh API error ${response.status}: ${body || response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Search skills by query string.
 * Single-word queries use fuzzy matching, multi-word use semantic search.
 */
export async function searchSkills(
  query: string,
  limit = 10,
  owner?: string
): Promise<SkillsShSearchResult> {
  const cacheKey = `search:${query}:${limit}:${owner || ''}`;
  const cached = getCached<SkillsShSearchResult>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (owner) params.set('owner', owner);

  const result = await apiFetch<SkillsShSearchResult>(
    `/skills/search?${params.toString()}`
  );

  setCache(cacheKey, result, CACHE_TTL.search);
  return result;
}

/**
 * List skills from the leaderboard.
 * Supports 'all-time', 'trending', and 'hot' views.
 */
export async function listSkills(
  view: 'all-time' | 'trending' | 'hot' = 'trending',
  page = 0,
  perPage = 50
): Promise<SkillsShListResult> {
  const cacheKey = `list:${view}:${page}:${perPage}`;
  const cached = getCached<SkillsShListResult>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    view,
    page: String(page),
    per_page: String(perPage),
  });

  const result = await apiFetch<SkillsShListResult>(
    `/skills?${params.toString()}`
  );

  setCache(cacheKey, result, CACHE_TTL.list);
  return result;
}

/**
 * Get detailed information about a single skill, including its SKILL.md content.
 */
export async function getSkillDetail(
  source: string,
  skill: string
): Promise<SkillsShDetailResult> {
  const cacheKey = `detail:${source}/${skill}`;
  const cached = getCached<SkillsShDetailResult>(cacheKey);
  if (cached) return cached;

  const result = await apiFetch<SkillsShDetailResult>(
    `/skills/${encodeURIComponent(source)}/${encodeURIComponent(skill)}`
  );

  setCache(cacheKey, result, CACHE_TTL.detail);
  return result;
}

/**
 * Get the official curated set of first-party skills.
 */
export async function getCuratedSkills(): Promise<{
  data: Array<{
    owner: string;
    totalInstalls: number;
    featuredRepo: string;
    featuredSkill: string;
    skills: SkillsShSkill[];
  }>;
  totalOwners: number;
  totalSkills: number;
}> {
  const cacheKey = 'curated';
  const cached = getCached<ReturnType<typeof getCuratedSkills>>(cacheKey);
  if (cached) return cached;

  const result = await apiFetch<ReturnType<typeof getCuratedSkills>>(
    '/skills/curated'
  );

  setCache(cacheKey, result, CACHE_TTL.curated);
  return result;
}

/**
 * Batch search: search multiple queries in parallel and deduplicate results.
 */
export async function batchSearchSkills(
  queries: string[],
  limitPerQuery = 5
): Promise<SkillsShSkill[]> {
  const results = await Promise.allSettled(
    queries.map((q) => searchSkills(q, limitPerQuery))
  );

  const seen = new Set<string>();
  const unique: SkillsShSkill[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const skill of result.value.data) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        unique.push(skill);
      }
    }
  }

  // Sort by install count (most popular first)
  unique.sort((a, b) => b.installs - a.installs);
  return unique;
}
