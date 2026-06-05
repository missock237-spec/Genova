/**
 * GENOVA AI OS — Rate Limiter
 * In-memory implementation (production: swap for Redis/Upstash).
 * Drop-in compatible: same interface for both backends.
 */

interface RateLimitOptions {
  max: number; // max requests
  windowMs: number; // window in ms
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

// ─── IN-MEMORY STORE ─────────────────────────────────────────────────────────

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

// ─── RATE LIMIT FUNCTION ─────────────────────────────────────────────────────

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now();
  const entry = store.get(key);
  const resetAt = entry?.resetAt ?? now + options.windowMs;

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + options.windowMs });
    return { success: true, remaining: options.max - 1, resetAt: now + options.windowMs };
  }

  if (entry.count >= options.max) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: options.max - entry.count, resetAt: entry.resetAt };
}
