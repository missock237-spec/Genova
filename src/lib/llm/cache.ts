// ============================================================
// Gen3ia — LLM Response Cache
// Cache les réponses LLM pour éviter des appels redondants
// Cache: mémoire + Redis (TTL configurable)
// ============================================================

import { createHash } from 'node:crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('llm-cache');

interface CacheEntry {
  content: string;
  tokens: number;
  cachedAt: number;
  ttl: number;
}

class LLMCache {
  private store = new Map<string, CacheEntry>();
  private redisEnabled = false;
  private hits = 0;
  private misses = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
    this.tryRedis();
  }

  private async tryRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      log.info('LLM cache using in-memory store (no REDIS_URL)');
      return;
    }
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      this.redisEnabled = true;
      redis.disconnect();
      log.info('LLM cache Redis enabled');
    } catch {
      log.info('LLM cache using in-memory store (Redis unavailable)');
    }
  }

  /** Génère une clé de cache depuis les messages */
  static generateKey(messages: Array<{ role: string; content: string }>, model: string): string {
    const data = JSON.stringify({ messages, model });
    return createHash('sha256').update(data).digest('hex').slice(0, 32);
  }

  async get(key: string): Promise<CacheEntry | null> {
    if (this.redisEnabled && process.env.REDIS_URL) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        const cached = await redis.get(`llm:cache:${key}`);
        redis.disconnect();
        if (cached) {
          this.hits++;
          return JSON.parse(cached);
        }
      } catch { /* fallback mémoire */ }
    }

    const entry = this.store.get(key);
    if (entry && Date.now() < entry.cachedAt + entry.ttl) {
      this.hits++;
      return entry;
    }
    if (entry) this.store.delete(key);
    this.misses++;
    return null;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    if (this.redisEnabled && process.env.REDIS_URL) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        await redis.setex(`llm:cache:${key}`, Math.ceil(entry.ttl / 1000), JSON.stringify(entry));
        redis.disconnect();
        return;
      } catch { /* fallback mémoire */ }
    }
    this.store.set(key, entry);
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
      redisEnabled: this.redisEnabled,
      hitRate: this.hits + this.misses > 0
        ? (this.hits / (this.hits + this.misses) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.cachedAt + entry.ttl) this.store.delete(key);
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

export const llmCache = new LLMCache();
