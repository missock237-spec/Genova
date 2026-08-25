// ============================================================
// Gen3ia — Service Worker v7 (NUCLEAR CACHE PURGE)
// ============================================================
//  v7 — FORCE UPGRADE :
//  - Fichier renommé + contenu changé pour casser le cache
//    de l'ancien SW (v5/v6) qui bloquait les utilisateurs.
//  - Supprime TOUS les caches à l'activation.
//  - skipWaiting() immédiat.
//  - Network-first pour tout (comme v6).
// ============================================================

const CACHE_VERSION = 'gen3ia-v0.10.0-e4d8d161';
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const PRECACHE_URLS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

// --- INSTALL : skipWaiting + purge + precache ---
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() =>
      caches.open(DYNAMIC_CACHE).then((cache) =>
        cache.addAll(PRECACHE_URLS).catch(() => {})
      )
    )
  );
});

// --- ACTIVATE : supprimer TOUS les caches + claim ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          console.log('[SW v7] Deleting cache:', key);
          return caches.delete(key);
        })
      )
    ).then(() => {
      // Informer tous les clients de recharger
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'FORCE_RELOAD' }));
      });
      return self.clients.claim();
    })
  );
});

// --- Communication SW <-> Client ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'GET_SW_VERSION') {
    event.ports[0]?.postMessage({
      type: 'SW_VERSION',
      cacheVersion: CACHE_VERSION,
      state: self.serviceWorker?.state || 'unknown',
    });
    return;
  }
});

// --- FETCH : NETWORK-FIRST pour tout ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) return;
  if (url.pathname === '/api/app-version') return;
  if (url.pathname.startsWith('/api/auth/')) return;

  // NE JAMAIS cacher la page HTML racine et les routes Next.js
  // pour éviter de bloquer les mises à jour
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/register') ||
    url.pathname.startsWith('/forgot-password') ||
    url.pathname.startsWith('/reset-password')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    );
    return;
  }

  // Pour les assets statiques hashés (_next/static/*) : network-first
  // avec cache fallback court (utile hors-ligne)
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(DYNAMIC_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({ error: 'Vous êtes hors-ligne', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })()
  );
});

// --- BACKGROUND SYNC ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-agent-executions') {
    event.waitUntil(syncQueuedExecutions());
  }
});

async function syncQueuedExecutions() {
  try {
    const cache = await caches.open(`${CACHE_VERSION}-queue`);
    const keys = await cache.keys();
    for (const key of keys) {
      const response = await cache.match(key);
      if (!response) continue;
      try {
        const body = await response.json();
        const result = await fetch(key.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (result.ok) await cache.delete(key);
      } catch {}
    }
  } catch (err) {
    console.error('[SW v7] sync failed:', err);
  }
}

// --- PUSH ---
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : { title: 'Gen3ia', body: 'Notification' };
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/icon-192.png',
      tag: payload.tag || 'gen3ia',
      data: payload.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
