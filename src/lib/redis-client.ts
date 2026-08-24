import Redis from 'ioredis';

// ============================================================
// Redis Client — Graceful degradation
// ============================================================
// Sur Vercel, Redis n'est pas disponible. Le client doit :
//   1. Ne PAS se connecter automatiquement (lazyConnect: true)
//   2. Ne PAS crash si REDIS_URL n'est pas défini
//   3. Fournir un objet null-safe que les appelants peuvent utiliser
// ============================================================

const REDIS_URL = process.env.REDIS_URL;

/**
 * Client Redis avec connexion paresseuse.
 * Si REDIS_URL n'est pas defini, les operations echoueront
 * silencieusement (logged) sans crasher l'application.
 */
export const redis: Redis | null = REDIS_URL
  ? new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(100 * Math.pow(2, times), 30000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,     // Ne pas connecter automatiquement
      commandTimeout: 5000,
    })
  : null;

if (redis) {
  redis.on('error', (err) => {
    // Eviter de spammer les logs pour ECONNREFUSED en dev
    if ((err as any).code === 'ECONNREFUSED') {
      console.warn('[Redis] Connection refused — Redis is not available. Some features (rate limiting, caching) will be degraded.');
    } else {
      console.error('[Redis] Error:', err);
    }
  });
  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('ready', () => console.log('[Redis] Ready'));
} else {
  console.warn(
    '[Redis] REDIS_URL not defined — running without Redis. ' +
    'Rate limiting, caching and queues will use in-memory fallbacks.'
  );
}

/**
 * Execute une operation Redis en toute securite.
 * Si Redis n'est pas disponible, retourne null silencieusement.
 */
export async function safeRedisOperation<T>(
  operation: (client: Redis) => Promise<T>,
): Promise<T | null> {
  if (!redis) return null;
  try {
    return await operation(redis);
  } catch (err) {
    console.warn('[Redis] Operation failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
