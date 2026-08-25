// ============================================================
// Rate Limiter — Distribué via Redis (ioredis / Upstash REST) + fallback mémoire
// Phase 2.2 — Rate limiting distribué
// - Limite par utilisateur (identity) et par IP (fallback)
// - Limite par ENDPOINT : categories AUTH, PAYMENT, API et défaut
// - Token bucket (burst contrôlé) via Redis (multi-instance)
// - Transport Upstash REST natif (fetch) quand UPSTASH_REDIS_REST_URL + TOKEN
//   sont définis — PAS de dépendance @upstash/redis requise, fonctionne en
//   Edge/Serverless. Sinon ioredis si REDIS_URL, sinon mémoire.
// - Fallback mémoire propre quand Redis est indisponible
// - Limites personnalisées par route (options.limit / options.windowMs)
// Compatible Vercel Edge, Serverless, et Docker multi-instances
// ============================================================

import { Redis } from 'ioredis';

// ---------- Politiques par catégorie d'endpoint (token bucket) ----------
export type RateLimitScope = 'default' | 'auth' | 'payment' | 'api';

interface Policy {
  /** capacite du bucket (burst max) */
  capacity: number;
  /** taux de remplissage par minute */
  refillPerMin: number;
  /** fenêtre d'affichage pour les headers X-RateLimit-Reset (secondes) */
  windowSec: number;
}

const POLICIES: Record<RateLimitScope, Policy> = {
  default: { capacity: 100, refillPerMin: 100, windowSec: 60 },
  auth:    { capacity: 10,  refillPerMin: 10,  windowSec: 60 },   // login/2FA/register : strict
  payment: { capacity: 20,  refillPerMin: 20,  windowSec: 60 },   // webhooks/intents
  api:     { capacity: 300, refillPerMin: 300, windowSec: 60 },   // routeurs API / agents
};

/** Options personnalisées par route (rétrocompatible). */
export interface RateLimitOptions {
  /** Nombre max de requêtes sur la fenêtre. */
  limit?: number;
  /** Durée de la fenêtre en ms. */
  windowMs?: number;
}

/**
 * Construit une politique custom à partir des options, ou retourne la
 * politique globale si aucune limite personnalisée n'est fournie.
 */
function resolvePolicy(scope: RateLimitScope, options?: RateLimitOptions): Policy {
  if (!options?.limit) return POLICIES[scope];
  const windowMs = options.windowMs ?? 60_000;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  // refillPerMin = capacité complète reconstituée sur la fenêtre (lissage simple)
  const refillPerMin = Math.max(1, Math.round((options.limit * 60_000) / windowMs));
  return { capacity: options.limit, refillPerMin, windowSec };
}

// ---------- Fallback mémoire (utilisé quand Redis n'est pas disponible) ----------
const memoryStore = new Map<
  string,
  { tokens: number; lastRefill: number }
>();
let lastCleanup = Date.now();
const CLEANUP_INT = 300000; // 5 min

// ============================================================
// Transport Upstash REST natif (fetch) — aucune dépendance ajoutée
// ============================================================
//  Upstash REST : POST {REST_URL}/pipeline  avec Bearer {REST_TOKEN}
//  Exécute les commandes Redis de façon pipelinée (atomique par pipeline).
//  On exécute un token bucket en Lua (EVAL) pour l'atomicité multi-instance.
// ============================================================

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

function isUpstashConfigured(): boolean {
  return !!(UPSTASH_REST_URL && UPSTASH_REST_TOKEN);
}

async function upstashPipeline(
  command: Array<Array<string | number>>,
): Promise<Array<unknown> | null> {
  const url = UPSTASH_REST_URL.replace(/\/$/, '') + '/pipeline';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      // Timeout raisonnable pour ne pas bloquer la requête entrante
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown;
    // Format réponse pipeline Upstash : [{ result: X, error?: string }, ...]
    return data as Array<unknown>;
  } catch {
    // Fail-open : on retombera sur le fallback mémoire
    return null;
  }
}

/**
 * Exécute le token bucket de façon atomique côté Upstash via EVAL.
 * Retourne { allowed, remaining } ou null en cas d'échec (fallback mémoire).
 */
async function checkUpstash(key: string, policy: Policy): Promise<{ allowed: boolean; remaining: number } | null> {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);

  // Lua : reconstitution + décrément, le tout atomique.
  const script = `
    local key = KEYS[1]
    local cap = tonumber(ARGV[1])
    local refillPerSec = tonumber(ARGV[2])
    local now_sec = tonumber(ARGV[3])
    local tokens = tonumber(redis.call('GET', key))
    if tokens == nil then tokens = cap end
    local ts = tonumber(redis.call('HGET', key .. ':ts', 'v')) or now_sec
    tokens = math.min(cap, tokens + (now_sec - ts) * refillPerSec)
    local allowed = 0
    if tokens >= 1 then allowed = 1; tokens = tokens - 1 end
    redis.call('SET', key, tokens)
    redis.call('HSET', key .. ':ts', 'v', now_sec)
    redis.call('EXPIRE', key, math.max(60, math.ceil(cap / refillPerSec)))
    redis.call('EXPIRE', key .. ':ts', math.max(60, math.ceil(cap / refillPerSec)))
    return {allowed, math.max(0, math.floor(tokens))}
  `;

  const res = await upstashPipeline([
    ['EVAL', script, '1', key, String(policy.capacity), String(policy.refillPerMin / 60), String(nowSec)],
  ]);

  if (!res || !Array.isArray(res) || res.length === 0) {
    return null;
  }

  const first = res[0] as { result?: unknown; error?: string };
  if (first.error || first.result == null) {
    return null;
  }

  // EVAL retourne un tableau [allowed, remaining]
  const tuple = first.result as [number, number];
  if (!Array.isArray(tuple) || tuple.length < 2) {
    return null;
  }

  return {
    allowed: Number(tuple[0]) === 1,
    remaining: Math.max(0, Math.floor(Number(tuple[1]))),
  };
}

// ---------- Client ioredis (fallback secondaire, serveurs Redis classiques) ----------

function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL || '';
  if (!url) return null;
  try {
    return new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
  } catch {
    return null;
  }
}

function checkMemory(key: string, policy: Policy): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { tokens: policy.capacity, lastRefill: now };
    memoryStore.set(key, entry);
  }
  // refill
  entry.tokens = Math.min(policy.capacity, entry.tokens + (now - entry.lastRefill) * (policy.refillPerMin / 60000));
  entry.lastRefill = now;
  const allowed = entry.tokens >= 1;
  if (allowed) entry.tokens -= 1;
  const remaining = Math.floor(entry.tokens);

  // cleanup périodique
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now;
    for (const [k, v] of memoryStore) {
      if (now - v.lastRefill > policy.windowSec * 1000 * 2) memoryStore.delete(k);
    }
  }
  return { allowed, remaining, resetIn: policy.windowSec };
}

async function checkRedis(redis: Redis, key: string, policy: Policy): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const now = Date.now();
  const script = `
    local key = KEYS[1]
    local cap = tonumber(ARGV[1])
    local refillPerMs = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])
    local data = redis.call('HMGET', key, 'tokens', 'ts')
    local tokens = tonumber(data[1]) or cap
    local ts = tonumber(data[2]) or now
    tokens = math.min(cap, tokens + (now - ts) * refillPerMs)
    local allowed = 1
    if tokens < 1 then allowed = 0 else tokens = tokens - 1 end
    redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
    redis.call('EXPIRE', key, ttl)
    return {allowed, math.floor(tokens)}
  `;
  try {
    const res = (await redis.eval(
      script, 1, key,
      String(policy.capacity),
      String(policy.refillPerMin / 60000),
      String(now),
      String(policy.windowSec),
    )) as [number, number];
    const allowed = Number(res[0]) === 1;
    const remaining = Number(res[1]);
    return { allowed, remaining, resetIn: policy.windowSec };
  } catch {
    return { allowed: true, remaining: policy.capacity, resetIn: policy.windowSec }; // fail-open si erreur Redis
  }
}

function getClientIp(request: Request): string {
  // Ne pas faire confiance à x-forwarded-for seul (spoofable côté client)
  const cf = request.headers.get('cf-connecting-ip'); // Cloudflare
  if (cf) return cf;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}

/** Devine la catégorie d'endpoint à partir du path pour appliquer la bonne politique. */
export function scopeForPath(pathname: string): RateLimitScope {
  if (/\/(auth|api\/auth|api\/oauth|api\/twofa|register|signin|signup)/.test(pathname)) return 'auth';
  if (/\/payment|\/stripe|\/sebpay|\/api\/(payments|billing|credits|webhooks)/.test(pathname)) return 'payment';
  if (/^\/api\//.test(pathname)) return 'api';
  return 'default';
}

function getRateLimitKey(request: Request, scope: RateLimitScope, endpoint: string, userId?: string): string {
  const ip = getClientIp(request);
  const identity = userId || ip;
  // clé incluant endpoint + scope pour des limites par ressource
  return `rl:${scope}:${endpoint}:${identity}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  limit: number;
  scope: RateLimitScope;
}

/**
 * Fonction principale améliorée (rétrocompatible avec l'ancienne signature).
 * @param request  Request
 * @param userId   (optionnel) identité authentifiée
 * @param scope    catégorie d'endpoint (défaut: devinée depuis pathname)
 * @param endpoint (optionnel) clé explicite de l'endpoint
 * @param options  (optionnel) limites personnalisées { limit, windowMs }
 *
 * Ordre de résolution du transport :
 *   1. Upstash REST (UPSTASH_REDIS_REST_URL + TOKEN) — atomique via Lua
 *   2. ioredis (REDIS_URL) — serveur Redis classique
 *   3. Fallback mémoire (single-instance)
 */
export async function rateLimit(
  request: Request,
  userId?: string,
  scope?: RateLimitScope,
  endpoint?: string,
  options?: RateLimitOptions,
): Promise<RateLimitResult> {
  const url = new URL(request.url);
  const resolvedScope = scope ?? scopeForPath(url.pathname);
  const resolvedEndpoint = endpoint ?? url.pathname;
  const policy = resolvePolicy(resolvedScope, options);
  const key = getRateLimitKey(request, resolvedScope, resolvedEndpoint, userId);

  // 1. Upstash REST (préféré en serverless/edge)
  if (isUpstashConfigured()) {
    const upstashResult = await checkUpstash(key, policy);
    if (upstashResult) {
      return { ...upstashResult, resetIn: policy.windowSec, limit: policy.capacity, scope: resolvedScope };
    }
    // Échec Upstash -> fallback mémoire (jamais fail-open silencieusement pour les limites)
  }

  // 2. ioredis (serveur Redis classique)
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await checkRedis(redis, key, policy);
      redis.disconnect();
      return { ...result, limit: policy.capacity, scope: resolvedScope };
    } catch {
      try { redis.disconnect(); } catch { /* noop */ }
    }
  }

  // 3. Fallback mémoire
  const mem = checkMemory(key, policy);
  return { ...mem, limit: policy.capacity, scope: resolvedScope };
}

/** Version synchrone pour le middleware (défaut: mémoire uniquement). */
export function checkRateLimit(request: Request, scope: RateLimitScope = 'default'): boolean {
  const url = new URL(request.url);
  const resolvedScope = scope === 'default' ? scopeForPath(url.pathname) : scope;
  const policy = POLICIES[resolvedScope];
  const key = getRateLimitKey(request, resolvedScope, url.pathname);
  return checkMemory(key, policy).allowed;
}

/**
 * Rate limiter object with a `check` method for convenience.
 * Used by routes that import { rateLimiter } from '@/lib/rate-limiter'.
 */
export const rateLimiter = {
  async check(identifier: string, endpoint: string): Promise<{ allowed: boolean; resetIn: number }> {
    const policy = POLICIES.api;
    const key = `rl:api:${endpoint}:${identifier}`;
    const mem = checkMemory(key, policy);
    return { allowed: mem.allowed, resetIn: mem.resetIn };
  },
};
