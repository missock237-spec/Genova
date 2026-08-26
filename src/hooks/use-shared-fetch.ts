import { useState, useEffect, useCallback, useRef } from 'react';

// [js-01] Hook de fetch partagé avec déduplication et cache simple.
// Évite que 3 composants (header, dashboard, billing) fassent le même fetch.
// Usage : useSharedFetch<T>('/api/billing', { credentials: 'include' })

interface UseSharedFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Désactiver le fetch automatique au mount */
  disabled?: boolean;
  /** Clé de cache globale (défaut: URL) */
  cacheKey?: string;
  /** TTL du cache en ms (défaut: 30s) */
  cacheTtl?: number;
}

// Cache global en mémoire — partagé entre tous les composants
const globalCache = new Map<string, { data: unknown; timestamp: number }>();
const inFlight = new Map<string, Promise<unknown>>();

export function useSharedFetch<T = unknown>(
  url: string | null,
  options: UseSharedFetchOptions = {}
) {
  const {
    disabled = false,
    cacheKey,
    cacheTtl = 30_000,
    ...fetchOpts
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!disabled && !!url);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const key = cacheKey || url || '';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(async () => {
    if (!url || disabled) return;

    // [js-01] Vérifier le cache
    const cached = globalCache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      setData(cached.data as T);
      setLoading(false);
      setError(null);
      return;
    }

    // [js-01] Déduplication : si un fetch est déjà en cours, attendre le résultat
    const inflight = inFlight.get(key);
    if (inflight) {
      try {
        const result = await inflight;
        if (mountedRef.current) {
          setData(result as T);
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Fetch failed');
          setLoading(false);
        }
      }
      return;
    }

    // Abort précédent
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const fetchPromise = fetch(url, { ...fetchOpts, signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((result) => {
        if (!mountedRef.current) return;
        globalCache.set(key, { data: result, timestamp: Date.now() });
        setData(result as T);
        setLoading(false);
        return result;
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Fetch failed');
        setLoading(false);
        throw err;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, fetchPromise);
  }, [url, disabled, key, cacheTtl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    execute();
    return () => {
      abortRef.current?.abort();
    };
  }, [execute]);

  const refetch = useCallback(() => {
    globalCache.delete(key);
    return execute();
  }, [execute, key]);

  return { data, error, loading, refetch };
}
