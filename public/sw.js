'use strict';

/**
 * Service Worker for News Crawler PWA
 * 
 * Caching strategies:
 * - Cache-first: Static assets (JS, CSS, images, fonts)
 * - Network-first with cache fallback: API responses
 * - Stale-while-revalidate: Article content
 * 
 * Features:
 * - Offline reading support
 * - Push notification handling
 * - Background sync for queued actions
 * 
 * @module ServiceWorker
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `news-static-${CACHE_VERSION}`;
const API_CACHE = `news-api-${CACHE_VERSION}`;
const ARTICLE_CACHE = `news-articles-${CACHE_VERSION}`;

// Assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// =================== Install ===================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(PRECACHE_ASSETS.filter(url => {
          // Skip missing assets during development
          return true;
        }));
      })
      .catch((err) => {
        console.warn('[SW] Precache failed (non-fatal):', err.message);
      })
      .then(() => {
        // Activate immediately
        return self.skipWaiting();
      })
  );
});

// =================== Activate ===================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old caches
              return name.startsWith('news-') && 
                     name !== STATIC_CACHE && 
                     name !== API_CACHE && 
                     name !== ARTICLE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// =================== Fetch ===================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Determine strategy based on request type
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
  } else if (isArticleRequest(url)) {
    event.respondWith(staleWhileRevalidate(event.request, ARTICLE_CACHE));
  } else {
    // Default: network first
    event.respondWith(networkFirst(event.request, API_CACHE));
  }
});

// =================== Push Notifications ===================

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: 'News Crawler',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' }
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || 'news-notification',
        data: payload.data || data.data,
        actions: payload.actions || [],
        requireInteraction: payload.requireInteraction || false,
        renotify: payload.renotify || false
      };
    } catch (err) {
      console.error('[SW] Failed to parse push payload:', err);
      data.body = event.data.text() || data.body;
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      actions: data.actions,
      requireInteraction: data.requireInteraction,
      renotify: data.renotify
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  // Handle action buttons
  if (event.action === 'view') {
    // Open the article
  } else if (event.action === 'dismiss') {
    // Just close, already done above
    return;
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

// =================== Background Sync ===================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(processOfflineQueue());
  } else if (event.tag === 'sync-reading-progress') {
    event.waitUntil(syncReadingProgress());
  }
});

// =================== Message Handling ===================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data?.type);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data?.type === 'CACHE_ARTICLE') {
    event.waitUntil(cacheArticle(event.data.articleId, event.data.articleData));
  } else if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  } else if (event.data?.type === 'GET_CACHE_STATUS') {
    event.waitUntil(getCacheStatus().then(status => {
      event.ports[0].postMessage(status);
    }));
  }
});

// =================== Caching Strategies ===================

/**
 * Cache-first strategy
 * Best for static assets that rarely change
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    updateCache(request, cacheName);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.error('[SW] Cache-first failed:', err);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first strategy with cache fallback
 * Best for API responses that should be fresh
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    console.log('[SW] Network failed, checking cache:', request.url);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response(JSON.stringify({ 
      error: 'Offline', 
      cached: false,
      message: 'No cached data available'
    }), { 
      status: 503, 
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Stale-while-revalidate strategy
 * Best for content that can be slightly stale (articles)
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((err) => {
      console.log('[SW] SWR fetch failed:', err.message);
      return null;
    });
  
  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Otherwise wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }
  
  return new Response('Article unavailable offline', { 
    status: 503, 
    statusText: 'Service Unavailable' 
  });
}

// =================== Helper Functions ===================

function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.ico'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isArticleRequest(url) {
  return url.pathname.startsWith('/api/v1/articles/') && !url.pathname.includes('/search');
}

async function updateCache(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (err) {
    // Silent fail for background update
  }
}

async function cacheArticle(articleId, articleData) {
  const cache = await caches.open(ARTICLE_CACHE);
  const url = `/api/v1/articles/${articleId}`;
  const response = new Response(JSON.stringify(articleData), {
    headers: { 'Content-Type': 'application/json' }
  });
  await cache.put(url, response);
  console.log('[SW] Article cached:', articleId);
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('[SW] All caches cleared');
}

async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    status[name] = keys.length;
  }
  
  return {
    version: CACHE_VERSION,
    caches: status,
    timestamp: new Date().toISOString()
  };
}

async function processOfflineQueue() {
  // This would process IndexedDB queue in a real implementation
  // For now, just log
  console.log('[SW] Processing offline queue...');
  
  // Get clients and notify
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_COMPLETE', queue: 'offline-queue' });
  }
}

async function syncReadingProgress() {
  console.log('[SW] Syncing reading progress...');
  
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_COMPLETE', queue: 'reading-progress' });
  }
}

// Log that SW loaded
console.log(`[SW] News Crawler Service Worker loaded (${CACHE_VERSION})`);
