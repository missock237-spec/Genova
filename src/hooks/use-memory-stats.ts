'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ============================================================
// TYPES
// ============================================================

export interface MemoryStats {
  totalKnowledge: number;
  totalEpisodes: number;
  totalDocuments: number;
  totalEmbeddingVectors: number;
  totalConversations: number;
  totalMessages: number;
  memoryUsageKB: number;
  memoryAccessCount: number;
  averageRelevance: number | null;
  maxRelevance: number | null;
  minRelevance: number | null;
  categoryBreakdown: Record<string, number>;
  recentKnowledge: Array<{
    id: string;
    content: string;
    category: string;
    source: string;
    relevance: number;
    createdAt: string;
  }>;
}

interface UseMemoryStatsOptions {
  /** Auto-refresh interval in ms (0 = disabled) */
  refreshInterval?: number;
  /** Fetch on mount */
  fetchOnMount?: boolean;
}

// ============================================================
// HOOK
// ============================================================

export function useMemoryStats(userId: string, options: UseMemoryStatsOptions = {}) {
  const {
    refreshInterval = 0,
    fetchOnMount = true,
  } = options;

  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetch memory stats from the API
   */
  const refresh = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/memory/stats', {
        credentials: 'include',
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur réseau' }));
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [userId]);

  /**
   * Set up auto-refresh interval
   */
  useEffect(() => {
    if (refreshInterval > 0) {
      refreshTimerRef.current = setInterval(refresh, refreshInterval);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refreshInterval, refresh]);

  /**
   * Fetch on mount
   */
  useEffect(() => {
    if (fetchOnMount && userId) {
      refresh();
    }
  }, [fetchOnMount, userId, refresh]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    stats,
    isLoading,
    error,
    refresh,
  };
}
