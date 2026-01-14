'use strict';

/**
 * @fileoverview Tests for Push Subscription Adapter
 */

const Database = require('better-sqlite3');
const { createPushAdapter } = require('../../../src/data/db/sqlite/v1/queries/pushAdapter');

describe('pushAdapter', () => {
  let db;
  let adapter;
  let mockLogger;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Create users table for foreign key
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE
      )
    `);
    db.exec(`INSERT INTO users (email) VALUES ('test@example.com')`);

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    adapter = createPushAdapter(db, { logger: mockLogger });
    adapter.init();
  });

  afterEach(() => {
    db.close();
  });

  describe('init', () => {
    test('creates push subscriptions table', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='user_push_subscriptions'
      `).all();

      expect(tables.length).toBe(1);
    });

    test('creates indexes', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='user_push_subscriptions'
      `).all();

      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('saveSubscription', () => {
    test('saves new subscription', () => {
      const id = adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/endpoint/abc',
        p256dh: 'test-p256dh',
        auth: 'test-auth',
        userAgent: 'Chrome/90'
      });

      expect(id).toBeTruthy();
    });

    test('updates existing subscription on conflict', () => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/endpoint/abc',
        p256dh: 'old-key',
        auth: 'old-auth'
      });

      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/endpoint/abc',
        p256dh: 'new-key',
        auth: 'new-auth'
      });

      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/endpoint/abc');
      expect(sub.p256dh).toBe('new-key');
      expect(sub.auth).toBe('new-auth');
    });

    test('allows null userId for anonymous subscriptions', () => {
      const id = adapter.saveSubscription({
        userId: null,
        endpoint: 'https://push.example.com/anonymous',
        p256dh: 'test-key',
        auth: 'test-auth'
      });

      expect(id).toBeTruthy();

      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/anonymous');
      expect(sub.userId).toBeNull();
    });
  });

  describe('getSubscriptionByEndpoint', () => {
    test('returns subscription by endpoint', () => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/test',
        p256dh: 'key',
        auth: 'auth'
      });

      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/test');

      expect(sub).toBeTruthy();
      expect(sub.endpoint).toBe('https://push.example.com/test');
      expect(sub.userId).toBe(1);
    });

    test('returns null for unknown endpoint', () => {
      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/unknown');
      expect(sub).toBeNull();
    });
  });

  describe('getSubscriptionsByUser', () => {
    beforeEach(() => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/user1/device1',
        p256dh: 'key1',
        auth: 'auth1'
      });
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/user1/device2',
        p256dh: 'key2',
        auth: 'auth2'
      });
      adapter.saveSubscription({
        userId: null,
        endpoint: 'https://push.example.com/anonymous',
        p256dh: 'key3',
        auth: 'auth3'
      });
    });

    test('returns all subscriptions for user', () => {
      const subs = adapter.getSubscriptionsByUser(1);
      expect(subs.length).toBe(2);
    });

    test('returns empty array for user without subscriptions', () => {
      const subs = adapter.getSubscriptionsByUser(999);
      expect(subs).toEqual([]);
    });
  });

  describe('getSubscriptionsByUsers', () => {
    beforeEach(() => {
      db.exec(`INSERT INTO users (email) VALUES ('user2@example.com')`);

      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/user1',
        p256dh: 'key1',
        auth: 'auth1'
      });
      adapter.saveSubscription({
        userId: 2,
        endpoint: 'https://push.example.com/user2',
        p256dh: 'key2',
        auth: 'auth2'
      });
    });

    test('returns subscriptions for multiple users', () => {
      const subs = adapter.getSubscriptionsByUsers([1, 2]);
      expect(subs.length).toBe(2);
    });

    test('returns empty for empty array', () => {
      const subs = adapter.getSubscriptionsByUsers([]);
      expect(subs).toEqual([]);
    });
  });

  describe('getAllSubscriptions', () => {
    test('returns all subscriptions with limit', () => {
      for (let i = 0; i < 5; i++) {
        adapter.saveSubscription({
          userId: 1,
          endpoint: `https://push.example.com/device${i}`,
          p256dh: `key${i}`,
          auth: `auth${i}`
        });
      }

      const subs = adapter.getAllSubscriptions({ limit: 3 });
      expect(subs.length).toBe(3);
    });
  });

  describe('deleteSubscription', () => {
    test('deletes subscription by endpoint', () => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/to-delete',
        p256dh: 'key',
        auth: 'auth'
      });

      const deleted = adapter.deleteSubscription('https://push.example.com/to-delete');
      expect(deleted).toBe(true);

      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/to-delete');
      expect(sub).toBeNull();
    });

    test('returns false for unknown endpoint', () => {
      const deleted = adapter.deleteSubscription('https://push.example.com/unknown');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteUserSubscriptions', () => {
    test('deletes all subscriptions for user', () => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/1',
        p256dh: 'key1',
        auth: 'auth1'
      });
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/2',
        p256dh: 'key2',
        auth: 'auth2'
      });

      const deleted = adapter.deleteUserSubscriptions(1);
      expect(deleted).toBe(2);

      const subs = adapter.getSubscriptionsByUser(1);
      expect(subs.length).toBe(0);
    });
  });

  describe('associateSubscriptionWithUser', () => {
    test('associates anonymous subscription with user', () => {
      adapter.saveSubscription({
        userId: null,
        endpoint: 'https://push.example.com/anon',
        p256dh: 'key',
        auth: 'auth'
      });

      const updated = adapter.associateSubscriptionWithUser(
        'https://push.example.com/anon',
        1
      );

      expect(updated).toBe(true);

      const sub = adapter.getSubscriptionByEndpoint('https://push.example.com/anon');
      expect(sub.userId).toBe(1);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      adapter.saveSubscription({
        userId: 1,
        endpoint: 'https://push.example.com/1',
        p256dh: 'key1',
        auth: 'auth1'
      });
      adapter.saveSubscription({
        userId: null,
        endpoint: 'https://push.example.com/anon',
        p256dh: 'key2',
        auth: 'auth2'
      });
    });

    test('returns statistics', () => {
      const stats = adapter.getStats();

      expect(stats.totalSubscriptions).toBe(2);
      expect(stats.authenticatedSubscriptions).toBe(1);
      expect(stats.anonymousSubscriptions).toBe(1);
      expect(stats.activeUsers).toBe(1);
    });
  });

  describe('cleanupOldSubscriptions', () => {
    test('removes old anonymous subscriptions', () => {
      // Insert old subscription directly
      db.prepare(`
        INSERT INTO user_push_subscriptions 
        (user_id, endpoint, p256dh, auth, created_at)
        VALUES (NULL, 'https://push.example.com/old', 'key', 'auth', datetime('now', '-100 days'))
      `).run();

      // Recent subscription
      adapter.saveSubscription({
        userId: null,
        endpoint: 'https://push.example.com/new',
        p256dh: 'key',
        auth: 'auth'
      });

      const deleted = adapter.cleanupOldSubscriptions(90);
      expect(deleted).toBe(1);

      // New one should still exist
      const newSub = adapter.getSubscriptionByEndpoint('https://push.example.com/new');
      expect(newSub).toBeTruthy();
    });

    test('does not delete authenticated subscriptions', () => {
      // Insert old but authenticated subscription
      db.prepare(`
        INSERT INTO user_push_subscriptions 
        (user_id, endpoint, p256dh, auth, created_at)
        VALUES (1, 'https://push.example.com/old-auth', 'key', 'auth', datetime('now', '-100 days'))
      `).run();

      const deleted = adapter.cleanupOldSubscriptions(90);
      expect(deleted).toBe(0);
    });
  });
});

