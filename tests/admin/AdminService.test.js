'use strict';

/**
 * AdminService unit tests
 */

const path = require('path');
const Database = require('better-sqlite3');
const { AdminService } = require('../../src/admin/AdminService');
const { createAdminAdapter } = require('../../src/db/sqlite/v1/queries/adminAdapter');

describe('AdminService', () => {
  let db;
  let adminAdapter;
  let adminService;

  beforeAll(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    
    // Create users table (matching real schema)
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
    
    // Create crawl_jobs table for getRecentCrawls
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
    
    // Create supporting tables for stats
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_type TEXT,
        timestamp TEXT
      )
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        token TEXT,
        expires_at TEXT
      )
    `);
    
    db.exec(`CREATE TABLE IF NOT EXISTS urls (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS http_responses (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS content_analysis (id INTEGER PRIMARY KEY)`);
    
    adminAdapter = createAdminAdapter(db);
    adminService = new AdminService({ adminAdapter });
    
    // Seed test data
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run('admin@example.com', 'Admin User', 'admin', 1);
    
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run('user1@example.com', 'User One', 'user', 1);
    
    db.prepare(`
      INSERT INTO users (email, display_name, role, is_active, suspended_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('suspended@example.com', 'Suspended User', 'user', 0, new Date().toISOString());
  });

  afterAll(() => {
    db.close();
  });

  describe('listUsers', () => {
    test('returns all users with default options', () => {
      const result = adminService.listUsers();
      
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('total');
      expect(result.users.length).toBe(3);
      expect(result.total).toBe(3);
    });

    test('respects limit parameter', () => {
      const result = adminService.listUsers({ limit: 2 });
      
      expect(result.users.length).toBe(2);
      expect(result.total).toBe(3);
    });

    test('respects offset parameter', () => {
      const result = adminService.listUsers({ limit: 2, offset: 2 });
      
      expect(result.users.length).toBe(1);
    });

    test('filters by search term', () => {
      const result = adminService.listUsers({ search: 'admin' });
      
      expect(result.users.length).toBe(1);
      expect(result.users[0].email).toBe('admin@example.com');
    });
  });

  describe('getUser', () => {
    test('returns user by id', () => {
      const user = adminService.getUser(1);
      
      expect(user).toBeDefined();
      expect(user.email).toBe('admin@example.com');
    });

    test('returns null for non-existent user', () => {
      const user = adminService.getUser(999);
      
      expect(user).toBeNull();
    });
  });

  describe('suspendUser', () => {
    test('suspends an active user', () => {
      // Find the user1 id
      const users = db.prepare('SELECT id FROM users WHERE email = ?').get('user1@example.com');
      const userId = users.id;
      
      const result = adminService.suspendUser(1, userId, 'Test suspension');
      
      expect(result.success).toBe(true);
      
      // Verify suspended
      const user = adminService.getUser(userId);
      expect(user.suspendedAt).toBeTruthy();
      expect(user.isActive).toBe(false);
      
      // Revert for other tests
      adminService.unsuspendUser(1, userId);
    });

    test('throws error for already suspended user', () => {
      const suspendedUser = db.prepare('SELECT id FROM users WHERE email = ?').get('suspended@example.com');
      
      expect(() => {
        adminService.suspendUser(1, suspendedUser.id, 'Test');
      }).toThrow('User is already suspended');
    });
  });

  describe('unsuspendUser', () => {
    test('unsuspends a suspended user', () => {
      const suspendedUser = db.prepare('SELECT id FROM users WHERE email = ?').get('suspended@example.com');
      
      const result = adminService.unsuspendUser(1, suspendedUser.id);
      expect(result.success).toBe(true);
      
      // Verify unsuspended
      const user = adminService.getUser(suspendedUser.id);
      expect(user.suspendedAt).toBeFalsy();
      expect(user.isActive).toBe(true);
      
      // Revert for other tests
      db.prepare('UPDATE users SET is_active = 0, suspended_at = datetime(\'now\') WHERE id = ?').run(suspendedUser.id);
    });

    test('throws error for active user', () => {
      const activeUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com');
      
      expect(() => {
        adminService.unsuspendUser(1, activeUser.id);
      }).toThrow('User is not suspended');
    });
  });

  describe('updateUserRole', () => {
    test('updates user role', () => {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get('user1@example.com');
      
      const result = adminService.updateUserRole(1, user.id, 'moderator');
      expect(result.success).toBe(true);
      
      // Verify role changed
      const updated = adminService.getUser(user.id);
      expect(updated.role).toBe('moderator');
      
      // Revert
      adminService.updateUserRole(1, user.id, 'user');
    });

    test('throws error for invalid role', () => {
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get('user1@example.com');
      
      expect(() => {
        adminService.updateUserRole(1, user.id, 'superadmin');
      }).toThrow('Invalid role');
    });
  });

  describe('getSystemHealth', () => {
    test('returns system health data', () => {
      const health = adminService.getSystemHealth();
      
      expect(health).toHaveProperty('cpu');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('users');
      expect(health).toHaveProperty('database');
      
      expect(health.cpu).toHaveProperty('usage');
      expect(health.memory).toHaveProperty('used');
      expect(health.memory).toHaveProperty('total');
    });

    test('includes user statistics', () => {
      const health = adminService.getSystemHealth();
      
      expect(health.users.total).toBe(3);
      expect(health.users.active).toBe(2);
      expect(health.users.suspended).toBe(1);
    });
  });

  describe('getAuditLog', () => {
    test('returns audit log entries', () => {
      // First create an audit entry by suspending/unsuspending
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get('user1@example.com');
      adminService.suspendUser(1, user.id, 'Test audit');
      adminService.unsuspendUser(1, user.id);
      
      const result = adminService.getAuditLog({ limit: 10 });
      
      expect(result).toHaveProperty('entries');
      expect(result).toHaveProperty('total');
      expect(result.entries.length).toBeGreaterThan(0);
    });

    test('filters by action', () => {
      const result = adminService.getAuditLog({ action: 'user_suspended' });
      
      expect(result.entries.every(e => e.action === 'user_suspended')).toBe(true);
    });
  });
});
