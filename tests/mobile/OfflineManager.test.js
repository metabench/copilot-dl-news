'use strict';

/**
 * @fileoverview Tests for OfflineManager
 * 
 * Tests IndexedDB operations for offline article storage.
 * Uses fake-indexeddb for Node.js environment.
 */

// Mock IndexedDB for Node.js
require('fake-indexeddb/auto');

const { OfflineManager, STORES, DB_NAME } = require('../../src/ui/mobile/OfflineManager');

describe('OfflineManager', () => {
  let manager;
  let mockLogger;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    manager = new OfflineManager({
      maxArticles: 10,
      maxQueueSize: 50,
      logger: mockLogger
    });

    await manager.init();
  });

  afterEach(() => {
    if (manager) {
      manager.close();
    }
    // Clear IndexedDB between tests
    indexedDB.deleteDatabase(DB_NAME);
  });

  describe('constructor', () => {
    test('creates manager with default options', () => {
      const m = new OfflineManager();
      expect(m.maxArticles).toBe(100);
      expect(m.maxQueueSize).toBe(500);
      m.close();
    });

    test('accepts custom options', () => {
      expect(manager.maxArticles).toBe(10);
      expect(manager.maxQueueSize).toBe(50);
    });

    test('reports IndexedDB support', () => {
      expect(manager.isSupported()).toBe(true);
    });
  });

  describe('init', () => {
    test('initializes database successfully', async () => {
      expect(manager.db).toBeTruthy();
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Database opened')
      );
    });

    test('creates all required stores', async () => {
      const storeNames = Array.from(manager.db.objectStoreNames);
      expect(storeNames).toContain(STORES.SAVED_ARTICLES);
      expect(storeNames).toContain(STORES.READ_LATER);
      expect(storeNames).toContain(STORES.OFFLINE_QUEUE);
      expect(storeNames).toContain(STORES.READING_PROGRESS);
      expect(storeNames).toContain(STORES.SETTINGS);
    });

    test('handles multiple init calls', async () => {
      const db1 = await manager.init();
      const db2 = await manager.init();
      expect(db1).toBe(db2);
    });
  });

  describe('saveArticle', () => {
    test('saves article successfully', async () => {
      const article = {
        id: 1,
        title: 'Test Article',
        body: '<p>Article content</p>',
        author: 'Test Author',
        host: 'example.com'
      };

      const result = await manager.saveArticle(article);

      expect(result.success).toBe(true);
      expect(result.evicted).toBe(0);
    });

    test('retrieves saved article', async () => {
      const article = {
        id: 42,
        title: 'Saved Article',
        body: '<p>Content</p>'
      };

      await manager.saveArticle(article);
      const retrieved = await manager.getArticle(42);

      expect(retrieved).toBeTruthy();
      expect(retrieved.id).toBe(42);
      expect(retrieved.title).toBe('Saved Article');
      expect(retrieved.savedAt).toBeTruthy();
    });

    test('evicts old articles when at limit', async () => {
      // Save 10 articles (at limit)
      for (let i = 1; i <= 10; i++) {
        await manager.saveArticle({
          id: i,
          title: `Article ${i}`,
          body: `<p>Content ${i}</p>`
        });
      }

      // Save one more
      const result = await manager.saveArticle({
        id: 11,
        title: 'New Article',
        body: '<p>New content</p>'
      });

      expect(result.evicted).toBeGreaterThan(0);

      // Newest should exist
      const newest = await manager.getArticle(11);
      expect(newest).toBeTruthy();
    });

    test('updates existing article', async () => {
      await manager.saveArticle({
        id: 1,
        title: 'Original',
        body: '<p>Original</p>'
      });

      await manager.saveArticle({
        id: 1,
        title: 'Updated',
        body: '<p>Updated</p>'
      });

      const article = await manager.getArticle(1);
      expect(article.title).toBe('Updated');
    });
  });

  describe('getAllArticles', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 5; i++) {
        await manager.saveArticle({
          id: i,
          title: `Article ${i}`,
          body: `<p>Content ${i}</p>`
        });
        // Small delay to ensure different timestamps
        await new Promise(r => setTimeout(r, 10));
      }
    });

    test('returns all saved articles', async () => {
      const articles = await manager.getAllArticles();
      expect(articles.length).toBe(5);
    });

    test('sorts by newest first by default', async () => {
      const articles = await manager.getAllArticles();
      expect(articles[0].id).toBe(5);
    });

    test('respects limit option', async () => {
      const articles = await manager.getAllArticles({ limit: 2 });
      expect(articles.length).toBe(2);
    });

    test('can sort oldest first', async () => {
      const articles = await manager.getAllArticles({ sortNewest: false });
      expect(articles[0].id).toBe(1);
    });
  });

  describe('deleteArticle', () => {
    test('deletes saved article', async () => {
      await manager.saveArticle({
        id: 1,
        title: 'To Delete',
        body: '<p>Content</p>'
      });

      const result = await manager.deleteArticle(1);
      expect(result).toBe(true);

      const article = await manager.getArticle(1);
      expect(article).toBeNull();
    });
  });

  describe('isArticleSaved', () => {
    test('returns true for saved article', async () => {
      await manager.saveArticle({
        id: 1,
        title: 'Saved',
        body: '<p>Content</p>'
      });

      const isSaved = await manager.isArticleSaved(1);
      expect(isSaved).toBe(true);
    });

    test('returns false for unsaved article', async () => {
      const isSaved = await manager.isArticleSaved(999);
      expect(isSaved).toBe(false);
    });
  });

  describe('getSavedCount', () => {
    test('returns correct count', async () => {
      expect(await manager.getSavedCount()).toBe(0);

      await manager.saveArticle({ id: 1, title: 'A', body: '' });
      await manager.saveArticle({ id: 2, title: 'B', body: '' });

      expect(await manager.getSavedCount()).toBe(2);
    });
  });

  describe('queueAction', () => {
    test('queues action for background sync', async () => {
      const entryId = await manager.queueAction('view', {
        articleId: 42,
        timestamp: Date.now()
      });

      expect(entryId).toBeTruthy();
    });

    test('retrieves queued actions', async () => {
      await manager.queueAction('view', { articleId: 1 });
      await manager.queueAction('share', { articleId: 2 });

      const actions = await manager.getQueuedActions();
      expect(actions.length).toBe(2);
      expect(actions[0].action).toBe('view');
      expect(actions[1].action).toBe('share');
    });

    test('removes queued action', async () => {
      const entryId = await manager.queueAction('test', { data: 'test' });
      
      await manager.removeQueuedAction(entryId);

      const actions = await manager.getQueuedActions();
      expect(actions.length).toBe(0);
    });

    test('clears all queued actions', async () => {
      await manager.queueAction('a', {});
      await manager.queueAction('b', {});
      await manager.queueAction('c', {});

      await manager.clearQueue();

      const actions = await manager.getQueuedActions();
      expect(actions.length).toBe(0);
    });
  });

  describe('saveProgress', () => {
    test('saves reading progress', async () => {
      await manager.saveProgress(42, {
        scrollPercent: 75,
        timeSpentMs: 120000,
        completed: false
      });

      const progress = await manager.getProgress(42);
      expect(progress).toBeTruthy();
      expect(progress.scrollPercent).toBe(75);
      expect(progress.timeSpentMs).toBe(120000);
      expect(progress.completed).toBe(false);
    });

    test('updates progress', async () => {
      await manager.saveProgress(42, { scrollPercent: 50 });
      await manager.saveProgress(42, { scrollPercent: 100, completed: true });

      const progress = await manager.getProgress(42);
      expect(progress.scrollPercent).toBe(100);
      expect(progress.completed).toBe(true);
    });

    test('returns null for unknown article', async () => {
      const progress = await manager.getProgress(999);
      expect(progress).toBeNull();
    });
  });

  describe('settings', () => {
    test('saves and retrieves setting', async () => {
      await manager.setSetting('theme', 'dark');

      const theme = await manager.getSetting('theme');
      expect(theme).toBe('dark');
    });

    test('returns default for missing setting', async () => {
      const value = await manager.getSetting('missing', 'default');
      expect(value).toBe('default');
    });

    test('handles complex values', async () => {
      const config = { notifications: true, fontSize: 16 };
      await manager.setSetting('config', config);

      const retrieved = await manager.getSetting('config');
      expect(retrieved).toEqual(config);
    });
  });

  describe('getStorageStats', () => {
    test('returns storage statistics', async () => {
      await manager.saveArticle({ id: 1, title: 'A', body: '' });
      await manager.saveArticle({ id: 2, title: 'B', body: '' });
      await manager.queueAction('test', {});
      await manager.setSetting('key', 'value');

      const stats = await manager.getStorageStats();

      expect(stats.savedArticles).toBe(2);
      expect(stats.queuedActions).toBe(1);
      expect(stats.settings).toBe(1);
      expect(stats.maxArticles).toBe(10);
    });
  });

  describe('clearAll', () => {
    test('clears all data', async () => {
      await manager.saveArticle({ id: 1, title: 'A', body: '' });
      await manager.queueAction('test', {});
      await manager.setSetting('key', 'value');

      await manager.clearAll();

      const stats = await manager.getStorageStats();
      expect(stats.savedArticles).toBe(0);
      expect(stats.queuedActions).toBe(0);
      expect(stats.settings).toBe(0);
    });
  });
});
