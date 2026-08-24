import { redis, safeRedisOperation } from './redis-client';

const DEFAULT_TTL = 60; // secondes

export async function getCache<T>(key: string): Promise<T | null> {
  return safeRedisOperation(async (client) => {
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  });
}

export async function setCache<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<void> {
  await safeRedisOperation(async (client) => {
    await client.set(key, JSON.stringify(value), 'EX', ttl);
  });
}

export async function delCache(key: string): Promise<void> {
  await safeRedisOperation(async (client) => {
    await client.del(key);
  });
}

export function cacheKey(...parts: string[]): string {
  return `cache:${parts.join(':')}`;
}