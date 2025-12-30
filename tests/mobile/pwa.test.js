'use strict';

/**
 * @fileoverview Tests for Service Worker functionality
 * 
 * These tests verify the service worker logic in isolation.
 * For full PWA testing, use Lighthouse or browser DevTools.
 */

const fs = require('fs');
const path = require('path');

describe('Service Worker', () => {
  let swContent;

  beforeAll(() => {
    const swPath = path.join(__dirname, '../../public/sw.js');
    swContent = fs.readFileSync(swPath, 'utf-8');
  });

  describe('Configuration', () => {
    test('defines cache version', () => {
      expect(swContent).toContain("CACHE_VERSION = 'v1'");
    });

    test('defines cache names', () => {
      expect(swContent).toContain('STATIC_CACHE');
      expect(swContent).toContain('API_CACHE');
      expect(swContent).toContain('ARTICLE_CACHE');
    });

    test('defines precache assets', () => {
      expect(swContent).toContain('PRECACHE_ASSETS');
      expect(swContent).toContain("'/'");
      expect(swContent).toContain("'/manifest.json'");
    });
  });

  describe('Event Handlers', () => {
    test('has install event handler', () => {
      expect(swContent).toContain("addEventListener('install'");
    });

    test('has activate event handler', () => {
      expect(swContent).toContain("addEventListener('activate'");
    });

    test('has fetch event handler', () => {
      expect(swContent).toContain("addEventListener('fetch'");
    });

    test('has push event handler', () => {
      expect(swContent).toContain("addEventListener('push'");
    });

    test('has notification click handler', () => {
      expect(swContent).toContain("addEventListener('notificationclick'");
    });

    test('has background sync handler', () => {
      expect(swContent).toContain("addEventListener('sync'");
    });

    test('has message handler', () => {
      expect(swContent).toContain("addEventListener('message'");
    });
  });

  describe('Caching Strategies', () => {
    test('implements cache-first strategy', () => {
      expect(swContent).toContain('async function cacheFirst');
    });

    test('implements network-first strategy', () => {
      expect(swContent).toContain('async function networkFirst');
    });

    test('implements stale-while-revalidate strategy', () => {
      expect(swContent).toContain('async function staleWhileRevalidate');
    });
  });

  describe('Helper Functions', () => {
    test('has static asset detection', () => {
      expect(swContent).toContain('function isStaticAsset');
      expect(swContent).toContain('.js');
      expect(swContent).toContain('.css');
      expect(swContent).toContain('.png');
    });

    test('has API request detection', () => {
      expect(swContent).toContain('function isApiRequest');
      expect(swContent).toContain('/api/');
    });

    test('has article request detection', () => {
      expect(swContent).toContain('function isArticleRequest');
      expect(swContent).toContain('/api/v1/articles/');
    });
  });

  describe('Push Notification Handling', () => {
    test('parses push payload as JSON', () => {
      expect(swContent).toContain('event.data.json()');
    });

    test('shows notification with title and body', () => {
      expect(swContent).toContain('showNotification');
    });

    test('handles notification click', () => {
      expect(swContent).toContain('notification.close()');
      expect(swContent).toContain('clients.openWindow');
    });
  });

  describe('Message Handling', () => {
    test('handles SKIP_WAITING message', () => {
      expect(swContent).toContain("'SKIP_WAITING'");
      expect(swContent).toContain('self.skipWaiting()');
    });

    test('handles CACHE_ARTICLE message', () => {
      expect(swContent).toContain("'CACHE_ARTICLE'");
    });

    test('handles CLEAR_CACHE message', () => {
      expect(swContent).toContain("'CLEAR_CACHE'");
    });

    test('handles GET_CACHE_STATUS message', () => {
      expect(swContent).toContain("'GET_CACHE_STATUS'");
    });
  });

  describe('Background Sync', () => {
    test('handles offline queue sync', () => {
      expect(swContent).toContain("'sync-offline-queue'");
      expect(swContent).toContain('processOfflineQueue');
    });

    test('handles reading progress sync', () => {
      expect(swContent).toContain("'sync-reading-progress'");
      expect(swContent).toContain('syncReadingProgress');
    });
  });
});

describe('Manifest', () => {
  let manifest;

  beforeAll(() => {
    const manifestPath = path.join(__dirname, '../../public/manifest.json');
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  });

  describe('Required Fields', () => {
    test('has name', () => {
      expect(manifest.name).toBe('News Crawler');
    });

    test('has short_name', () => {
      expect(manifest.short_name).toBe('NewsCrawl');
    });

    test('has start_url', () => {
      expect(manifest.start_url).toBe('/');
    });

    test('has display mode', () => {
      expect(manifest.display).toBe('standalone');
    });

    test('has theme_color', () => {
      expect(manifest.theme_color).toBeTruthy();
    });

    test('has background_color', () => {
      expect(manifest.background_color).toBeTruthy();
    });
  });

  describe('Icons', () => {
    test('has icons array', () => {
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);
    });

    test('has 192x192 icon', () => {
      const icon192 = manifest.icons.find(i => i.sizes === '192x192');
      expect(icon192).toBeTruthy();
      expect(icon192.type).toBe('image/png');
    });

    test('has 512x512 icon', () => {
      const icon512 = manifest.icons.find(i => i.sizes === '512x512');
      expect(icon512).toBeTruthy();
      expect(icon512.type).toBe('image/png');
    });

    test('has maskable icons', () => {
      const maskable = manifest.icons.filter(i => i.purpose?.includes('maskable'));
      expect(maskable.length).toBeGreaterThan(0);
    });
  });

  describe('PWA Features', () => {
    test('has description', () => {
      expect(manifest.description).toBeTruthy();
    });

    test('has orientation', () => {
      expect(manifest.orientation).toBe('portrait-primary');
    });

    test('has shortcuts', () => {
      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      expect(manifest.shortcuts.length).toBeGreaterThan(0);
    });

    test('has share_target', () => {
      expect(manifest.share_target).toBeTruthy();
      expect(manifest.share_target.action).toBeTruthy();
    });
  });
});
