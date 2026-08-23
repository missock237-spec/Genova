// ============================================================
// Gen3ia — PWA Helpers
// ============================================================
//  Enregistrement du service worker, détection offline,
//  stratégies de cache, et file d'attente pour les exécutions
//  d'agents quand l'utilisateur n'a pas de connexion.
// ============================================================

import { useSyncExternalStore } from 'react';

/**
 * URL du service worker, versionnée par buildId (fallback : dev).
 * Le paramètre de version force le navigateur à re-vérifier sw.js à
 * chaque chargement au lieu de réutiliser un sw.js en cache HTTP.
 * NEXT_PUBLIC_BUILD_ID est injecté au build par scripts/prebuild.js
 * et remplacé statiquement dans le bundle client par Next.js.
 */
function getServiceWorkerUrl(): string {
  const buildId =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_ID
      ? process.env.NEXT_PUBLIC_BUILD_ID
      : 'dev';
  return `/sw.js?v=${encodeURIComponent(buildId)}`;
}

/**
 * Enregistre le service worker.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(getServiceWorkerUrl(), { updateViaCache: 'none' })
      .then((reg) => {
        console.info('[PWA] Service Worker registered', reg.scope);
        // Forcer une mise à jour immédiate pour capter une version
        // déployée entre deux chargements.
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[PWA] SW registration failed', err);
      });
  });
}

/**
 * Désactive le service worker.
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    await reg.unregister();
  }
}

// --- Détection offline (SSR-safe avec useSyncExternalStore) ---

const offlineListeners = new Set<() => void>();

function subscribeOffline(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  offlineListeners.add(callback);
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    offlineListeners.delete(callback);
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOfflineSnapshot(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

/**
 * Hook React pour savoir si l'utilisateur est hors-ligne.
 * Utilise useSyncExternalStore (React 19 / SSR compatible).
 */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribeOffline, getOfflineSnapshot, () => false);
}

/**
 * Vérification synchrone de l'état offline.
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

// --- Stratégies de cache ---

/**
 * Network-first : essaie le réseau, fallback cache.
 * Idéal pour les API.
 */
export async function fetchWithNetworkFirst(url: string): Promise<Response> {
  try {
    const response = await fetch(url);
    if (response.ok && 'caches' in window) {
      const cache = await caches.open('gen3ia-v1-api');
      await cache.put(url, response.clone());
    }
    return response;
  } catch {
    if ('caches' in window) {
      const cached = await caches.match(url);
      if (cached) return cached;
    }
    throw new Error('Hors-ligne et pas de cache disponible');
  }
}

/**
 * Cache-first : essaie le cache d'abord, fallback réseau.
 * Idéal pour les assets statiques.
 */
export async function fetchWithCacheFirst(url: string): Promise<Response> {
  if ('caches' in window) {
    const cached = await caches.match(url);
    if (cached) return cached;
  }
  const response = await fetch(url);
  if (response.ok && 'caches' in window) {
    const cache = await caches.open('gen3ia-v1-static');
    await cache.put(url, response.clone());
  }
  return response;
}

// --- File d'attente des exécutions d'agents (IndexedDB) ---

const DB_NAME = 'gen3ia-offline-queue';
const STORE_NAME = 'agent-executions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface QueuedExecution {
  agentId: string;
  prompt: string;
  createdAt: string;
}

/**
 * Ajoute une exécution d'agent à la file d'attente offline.
 */
export async function queueAgentExecution(execution: QueuedExecution): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).add(execution);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Récupère toutes les exécutions en attente.
 */
export async function getQueuedAgentExecutions(): Promise<QueuedExecution[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedExecution[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Supprime une exécution de la file après synchronisation.
 */
export async function removeQueuedExecution(id: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Synchronise toutes les exécutions en attente quand la connexion revient.
 */
export async function syncQueuedAgentExecutions(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueuedAgentExecutions();
  let synced = 0;
  let failed = 0;

  for (const exec of queue) {
    try {
      const response = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: exec.agentId, prompt: exec.prompt }),
      });
      if (response.ok) {
        await removeQueuedExecution((exec as QueuedExecution & { id: number }).id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
