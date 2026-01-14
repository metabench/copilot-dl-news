'use strict';

/**
 * adminAdapter unit tests
 */

const Database = require('better-sqlite3');
const { createAdminAdapter } = require('../../src/data/db/sqlite/v1/queries/adminAdapter');

describe('adminAdapter', () => {
  let db;
  let adapter;

  beforeAll(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    
    // Create users table first (required for foreign key)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL DEFAULT '',
        display_name TEXT,
        settings TEXT DEFAULT '{}',
        role TEXT DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT,
        suspended_at TEXT,
        suspended_reason TEXT
      )
    `);
    
    // Create crawl_jobs table for stats
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT DEFAULT 'pending',
        urls_found INTEGER DEFAULT 0,
        urls_processed INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        pages_crawled INTEGER DEFAULT 0,
        error_message TEXT
      )
    `);
    
    // Create supporting tables
    db.exec(`CREATE TABLE IF NOT EXISTS user_events (id INTEGER PRIMARY KEY, user_id INTEGER, event_type TEXT, timestamp TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, expires_at TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS urls (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS http_responses (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS content_analysis (id INTEGER PRIMARY KEY)`);
    
    adapter = createAdminAdapter(db);
    
    // Seed test data
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run('admin@test.com', 'Admin', 'admin', 1);
    
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run('user1@test.com', 'User 1', 'user', 1);
    
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active, suspended_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('user2@test.com', 'User 2', 'user', 0, new Date().toISOString());
  });

  afterAll(() => {
    db.close();
  });

  describe('ensureAdminSchema', () => {
    test('creates audit_log table', () => {
      // Table should exist after adapter creation
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
      ).all();
      
      expect(tables.length).toBe(1);
    });
  });

  describe('listUsers', () => {
    test('returns all users', () => {
      const result = adapter.listUsers({});
      
      expect(result.users.length).toBe(3);
      expect(result.total).toBe(3);
    });

    test('limits results', () => {
      const result = adapter.listUsers({ limit: 2 });
      
      expect(result.users.length).toBe(2);
      expect(result.total).toBe(3);
    });

    test('offsets results', () => {
      const result = adapter.listUsers({ limit: 10, offset: 2 });
      
      expect(result.users.length).toBe(1);
    });

    test('filters by search term in email', () => {
      const result = adapter.listUsers({ search: 'admin' });
      
      expect(result.users.length).toBe(1);
      expect(result.users[0].email).toBe('admin@test.com');
    });

    test('filters by search term in displayName', () => {
      const result = adapter.listUsers({ search: 'User 1' });
      
      expect(result.users.length).toBe(1);
      expect(result.users[0].displayName).toBe('User 1');
    });
  });

  describe('getUser', () => {
    test('returns user by id', () => {
      const user = adapter.getUser(1);
      
      expect(user).toBeDefined();
      expect(user.email).toBe('admin@test.com');
      expect(user.role).toBe('admin');
    });

    test('returns null for non-existent user', () => {
      const user = adapter.getUser(999);
      
      expect(user).toBeNull();
    });
  });

  describe('suspendUser', () => {
    test('suspends a user', () => {
      const result = adapter.suspendUser(2);
      
      expect(result.changes).toBe(1);
      
      // Verify suspended
      const user = adapter.getUser(2);
      expect(user.isActive).toBe(false);
      expect(user.suspendedAt).toBeTruthy();
      
      // Revert
      adapter.unsuspendUser(2);
    });
  });

  describe('unsuspendUser', () => {
    test('unsuspends a user', () => {
      const result = adapter.unsuspendUser(3);
      
      expect(result.changes).toBe(1);
      
      // Verify unsuspended
      const user = adapter.getUser(3);
      expect(user.isActive).toBe(true);
      expect(user.suspendedAt).toBeFalsy();
      
      // Revert
      adapter.suspendUser(3);
    });
  });

  describe('updateUserRole', () => {
    test('updates user role', () => {
      const result = adapter.updateUserRole(2, 'moderator');
      
      expect(result.changes).toBe(1);
      
      const user = adapter.getUser(2);
      expect(user.role).toBe('moderator');
      
      // Revert
      adapter.updateUserRole(2, 'user');
    });
  });

  describe('logAction', () => {
    test('logs an action to audit_log', () => {
      const result = adapter.logAction({
        adminId: 1,
        action: 'test_action',
        targetType: 'test',
        targetId: '123',
        details: { foo: 'bar' }
      });
      
      expect(result.id).toBeDefined();
      // logAction only returns id, not timestamp
    });

    test('logs action without optional fields', () => {
      const result = adapter.logAction({
        adminId: 1,
        action: 'minimal_action'
      });
      
      expect(result.id).toBeDefined();
    });
  });

  describe('getAuditLog', () => {
    beforeAll(() => {
      // Add some audit entries
      adapter.logAction({ adminId: 1, action: 'action_a', targetType: 'user' });
      adapter.logAction({ adminId: 1, action: 'action_b', targetType: 'config' });
      adapter.logAction({ adminId: 1, action: 'action_a', targetType: 'crawl' });
    });

    test('returns all audit entries', () => {
      const result = adapter.getAuditLog({});
      
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    test('filters by action', () => {
      const result = adapter.getAuditLog({ action: 'action_a' });
      
      expect(result.entries.every(e => e.action === 'action_a')).toBe(true);
    });

    test('filters by targetType', () => {
      const result = adapter.getAuditLog({ targetType: 'config' });
      
      expect(result.entries.every(e => e.targetType === 'config')).toBe(true);
    });

    test('limits results', () => {
      const result = adapter.getAuditLog({ limit: 2 });
      
      expect(result.entries.length).toBeLessThanOrEqual(2);
    });

    test('orders by timestamp descending', () => {
      const result = adapter.getAuditLog({ limit: 5 });
      
      for (let i = 0; i < result.entries.length - 1; i++) {
        const current = new Date(result.entries[i].createdAt);
        const next = new Date(result.entries[i + 1].createdAt);
        expect(current >= next).toBe(true);
      }
    });
  });

  describe('getSystemStats', () => {
    test('returns user statistics', () => {
      const stats = adapter.getSystemStats();
      
      expect(stats).toHaveProperty('users');
      expect(stats.users).toHaveProperty('total');
      expect(stats.users).toHaveProperty('active');
      expect(stats.users).toHaveProperty('suspended');
      expect(stats.users).toHaveProperty('admins');
      
      expect(stats.users.total).toBe(3);
      expect(stats.users.active).toBe(2);
      expect(stats.users.suspended).toBe(1);
      expect(stats.users.admins).toBe(1);
    });

    test('returns database statistics', () => {
      const stats = adapter.getSystemStats();
      
      expect(stats).toHaveProperty('database');
      expect(stats.database).toHaveProperty('urls');
      expect(stats.database).toHaveProperty('responses');
      expect(stats.database).toHaveProperty('analyses');
    });
  });

  describe('getRecentCrawls', () => {
    beforeAll(() => {
      // Add some crawl jobs
      db.prepare(`
        INSERT INTO crawl_jobs (status, started_at, pages_crawled)
        VALUES (?, ?, ?)
      `).run('completed', new Date().toISOString(), 100);
      
      db.prepare(`
        INSERT INTO crawl_jobs (status, started_at, pages_crawled)
        VALUES (?, ?, ?)
      `).run('running', new Date().toISOString(), 50);
    });

    test('returns recent crawl jobs', () => {
      const crawls = adapter.getRecentCrawls(10);
      
      expect(crawls.length).toBeGreaterThan(0);
      expect(crawls[0]).toHaveProperty('id');
      expect(crawls[0]).toHaveProperty('status');
    });

    test('limits results', () => {
      const crawls = adapter.getRecentCrawls(1);
      
      expect(crawls.length).toBe(1);
    });
  });
});

