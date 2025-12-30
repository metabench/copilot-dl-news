'use strict';

/**
 * AuditLogger unit tests
 */

const path = require('path');
const Database = require('better-sqlite3');
const { AuditLogger, AUDIT_ACTIONS } = require('../../src/admin/AuditLogger');
const { createAdminAdapter } = require('../../src/db/sqlite/v1/queries/adminAdapter');

describe('AuditLogger', () => {
  let db;
  let adminAdapter;
  let auditLogger;

  beforeAll(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');
    
    // Create users table (required for foreign key)
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
    
    // Create supporting tables
    db.exec(`CREATE TABLE IF NOT EXISTS user_events (id INTEGER PRIMARY KEY, user_id INTEGER, event_type TEXT, timestamp TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (id INTEGER PRIMARY KEY, user_id INTEGER, expires_at TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS crawl_jobs (id INTEGER PRIMARY KEY, status TEXT DEFAULT 'pending', urls_found INTEGER DEFAULT 0, urls_processed INTEGER DEFAULT 0, started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS urls (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS http_responses (id INTEGER PRIMARY KEY)`);
    db.exec(`CREATE TABLE IF NOT EXISTS content_analysis (id INTEGER PRIMARY KEY)`);
    
    adminAdapter = createAdminAdapter(db);
    auditLogger = new AuditLogger({ adminAdapter });
    
    // Seed admin user
    db.prepare('INSERT INTO users (email, role) VALUES (?, ?)').run('admin@example.com', 'admin');
  });

  afterAll(() => {
    db.close();
  });

  describe('AUDIT_ACTIONS', () => {
    test('exports all expected action constants', () => {
      expect(AUDIT_ACTIONS.USER_SUSPENDED).toBe('user_suspended');
      expect(AUDIT_ACTIONS.USER_UNSUSPENDED).toBe('user_unsuspended');
      expect(AUDIT_ACTIONS.ROLE_CHANGED).toBe('role_changed');
      expect(AUDIT_ACTIONS.CONFIG_UPDATED).toBe('config_updated');
      expect(AUDIT_ACTIONS.CRAWL_STARTED).toBe('crawl_started');
      expect(AUDIT_ACTIONS.CRAWL_STOPPED).toBe('crawl_stopped');
    });
  });

  describe('log', () => {
    test('logs an audit entry', () => {
      const result = auditLogger.log(
        1,
        AUDIT_ACTIONS.USER_SUSPENDED,
        {
          targetType: 'user',
          targetId: 2,
          details: { reason: 'Test suspension' }
        }
      );
      
      expect(result).toHaveProperty('id');
      // logAction only returns id, not timestamp
    });

    test('logs entry without optional fields', () => {
      const result = auditLogger.log(1, 'test_action');
      
      expect(result).toHaveProperty('id');
    });

    test('stores details as JSON', () => {
      const details = { foo: 'bar', count: 42 };
      
      auditLogger.log(1, 'test_json', { details });
      
      // Verify stored correctly (details are returned as object, not string)
      const entries = adminAdapter.getAuditLog({ limit: 1 });
      expect(entries.entries[0].details).toEqual(details);
    });
  });

  describe('convenience methods', () => {
    test('logUserSuspended creates correct entry', () => {
      const result = auditLogger.logUserSuspended(1, 2, 'Violation of TOS');
      
      expect(result).toHaveProperty('id');
      
      // Verify entry
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('user_suspended');
      expect(entry.target_type).toBe('user');
      expect(entry.target_id).toBe(2);
      expect(JSON.parse(entry.details)).toEqual({ reason: 'Violation of TOS' });
    });

    test('logUserUnsuspended creates correct entry', () => {
      const result = auditLogger.logUserUnsuspended(1, 2);
      
      expect(result).toHaveProperty('id');
      
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('user_unsuspended');
    });

    test('logRoleChanged creates correct entry', () => {
      const result = auditLogger.logRoleChanged(1, 2, 'user', 'moderator');
      
      expect(result).toHaveProperty('id');
      
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('role_changed');
      expect(JSON.parse(entry.details)).toEqual({
        oldRole: 'user',
        newRole: 'moderator'
      });
    });

    test('logConfigUpdated creates correct entry', () => {
      const result = auditLogger.logConfigUpdated(1, 'crawl', { rateLimit: 1000 });
      
      expect(result).toHaveProperty('id');
      
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('config_updated');
      expect(entry.target_type).toBe('config');
      // configKey is stored in details, not as target_id
      expect(JSON.parse(entry.details)).toEqual({
        configKey: 'crawl',
        changes: { rateLimit: 1000 }
      });
    });

    test('logCrawlStarted creates correct entry', () => {
      const result = auditLogger.logCrawlStarted(1, 123, { domains: ['example.com'] });
      
      expect(result).toHaveProperty('id');
      
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('crawl_started');
      expect(entry.target_type).toBe('crawl');
      expect(entry.target_id).toBe(123);
    });

    test('logCrawlStopped creates correct entry', () => {
      const result = auditLogger.logCrawlStopped(1, 123, 'Manual stop');
      
      expect(result).toHaveProperty('id');
      
      const entry = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.id);
      expect(entry.action).toBe('crawl_stopped');
      expect(JSON.parse(entry.details)).toEqual({ reason: 'Manual stop' });
    });
  });
});
