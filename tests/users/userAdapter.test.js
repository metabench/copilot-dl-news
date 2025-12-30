'use strict';

/**
 * @fileoverview Tests for userAdapter
 * 
 * Contract tests for user database operations.
 * Uses in-memory SQLite for isolation.
 */

const Database = require('better-sqlite3');
const { createUserAdapter, hashPassword, verifyPassword, generateSessionToken } = require('../../src/db/sqlite/v1/queries/userAdapter');

describe('userAdapter', () => {
  let db;
  let adapter;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create required dependent tables (minimal versions)
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_storage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        http_response_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS content_analysis (
        id INTEGER PRIMARY KEY,
        content_id INTEGER,
        title TEXT,
        summary TEXT,
        body_text TEXT
      );
      
      CREATE TABLE IF NOT EXISTS article_categories (
        content_id INTEGER,
        category TEXT,
        confidence REAL
      );
      
      CREATE TABLE IF NOT EXISTS http_responses (
        id INTEGER PRIMARY KEY,
        url_id INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY,
        url TEXT,
        host TEXT
      );
      
      CREATE TABLE IF NOT EXISTS article_trending (
        content_id INTEGER PRIMARY KEY,
        trend_score REAL
      );
      
      CREATE TABLE IF NOT EXISTS article_topics (
        content_id INTEGER,
        topic_id INTEGER,
        probability REAL
      );
    `);
    
    adapter = createUserAdapter(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  // =================== Password Hashing ===================

  describe('password hashing', () => {
    test('hashPassword returns hash and salt', () => {
      const { hash, salt } = hashPassword('testpassword123');
      
      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash.length).toBe(128); // SHA-512 hex = 128 chars
      expect(salt.length).toBe(32);  // 16 bytes hex = 32 chars
    });

    test('hashPassword generates different salts', () => {
      const result1 = hashPassword('testpassword');
      const result2 = hashPassword('testpassword');
      
      expect(result1.salt).not.toBe(result2.salt);
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('verifyPassword validates correct password', () => {
      const { hash, salt } = hashPassword('correctpassword');
      
      expect(verifyPassword('correctpassword', hash, salt)).toBe(true);
    });

    test('verifyPassword rejects incorrect password', () => {
      const { hash, salt } = hashPassword('correctpassword');
      
      expect(verifyPassword('wrongpassword', hash, salt)).toBe(false);
    });

    test('generateSessionToken creates unique tokens', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1.length).toBe(64); // 32 bytes hex
      expect(token1).not.toBe(token2);
    });
  });

  // =================== User CRUD ===================

  describe('user CRUD', () => {
    test('createUser creates user and returns id', () => {
      const result = adapter.createUser({
        email: 'test@example.com',
        password: 'testpassword123'
      });
      
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('number');
      expect(result.email).toBe('test@example.com');
      expect(result.verificationToken).toBeDefined();
    });

    test('createUser with display name', () => {
      const result = adapter.createUser({
        email: 'test@example.com',
        password: 'testpassword123',
        displayName: 'Test User'
      });
      
      const user = adapter.getUserById(result.id);
      expect(user.displayName).toBe('Test User');
    });

    test('createUser rejects duplicate email', () => {
      adapter.createUser({
        email: 'duplicate@example.com',
        password: 'password123'
      });
      
      expect(() => {
        adapter.createUser({
          email: 'duplicate@example.com',
          password: 'password456'
        });
      }).toThrow('Email already registered');
    });

    test('createUser rejects invalid email', () => {
      expect(() => {
        adapter.createUser({
          email: 'notanemail',
          password: 'password123'
        });
      }).toThrow('Invalid email');
    });

    test('createUser rejects short password', () => {
      expect(() => {
        adapter.createUser({
          email: 'test@example.com',
          password: 'short'
        });
      }).toThrow('Password must be at least 8 characters');
    });

    test('getUserById returns user', () => {
      const created = adapter.createUser({
        email: 'test@example.com',
        password: 'testpassword123'
      });
      
      const user = adapter.getUserById(created.id);
      
      expect(user).not.toBeNull();
      expect(user.id).toBe(created.id);
      expect(user.email).toBe('test@example.com');
      expect(user.isActive).toBe(true);
      expect(user.emailVerified).toBe(false);
    });

    test('getUserById returns null for missing user', () => {
      const user = adapter.getUserById(999);
      expect(user).toBeNull();
    });

    test('getUserByEmail returns user', () => {
      adapter.createUser({
        email: 'findme@example.com',
        password: 'testpassword123'
      });
      
      const user = adapter.getUserByEmail('findme@example.com');
      
      expect(user).not.toBeNull();
      expect(user.email).toBe('findme@example.com');
    });

    test('getUserByEmail is case-insensitive', () => {
      adapter.createUser({
        email: 'CaSeTest@example.com',
        password: 'testpassword123'
      });
      
      const user = adapter.getUserByEmail('casetest@EXAMPLE.COM');
      
      expect(user).not.toBeNull();
    });

    test('authenticateUser validates credentials', () => {
      adapter.createUser({
        email: 'auth@example.com',
        password: 'correctpassword'
      });
      
      const user = adapter.authenticateUser('auth@example.com', 'correctpassword');
      
      expect(user).not.toBeNull();
      expect(user.email).toBe('auth@example.com');
    });

    test('authenticateUser returns null for wrong password', () => {
      adapter.createUser({
        email: 'auth@example.com',
        password: 'correctpassword'
      });
      
      const user = adapter.authenticateUser('auth@example.com', 'wrongpassword');
      
      expect(user).toBeNull();
    });

    test('updateUser modifies user', () => {
      const created = adapter.createUser({
        email: 'update@example.com',
        password: 'testpassword123'
      });
      
      adapter.updateUser(created.id, { displayName: 'Updated Name' });
      
      const user = adapter.getUserById(created.id);
      expect(user.displayName).toBe('Updated Name');
    });

    test('deleteUser removes user', () => {
      const created = adapter.createUser({
        email: 'delete@example.com',
        password: 'testpassword123'
      });
      
      const result = adapter.deleteUser(created.id);
      
      expect(result.changes).toBe(1);
      expect(adapter.getUserById(created.id)).toBeNull();
    });

    test('verifyEmail marks email as verified', () => {
      const created = adapter.createUser({
        email: 'verify@example.com',
        password: 'testpassword123'
      });
      
      expect(adapter.getUserById(created.id).emailVerified).toBe(false);
      
      adapter.verifyEmail(created.id);
      
      expect(adapter.getUserById(created.id).emailVerified).toBe(true);
    });
  });

  // =================== Sessions ===================

  describe('sessions', () => {
    let testUserId;

    beforeEach(() => {
      const result = adapter.createUser({
        email: 'session@example.com',
        password: 'testpassword123'
      });
      testUserId = result.id;
    });

    test('createSession returns token and expiry', () => {
      const session = adapter.createSession({
        userId: testUserId
      });
      
      expect(session.token).toBeDefined();
      expect(session.token.length).toBe(64);
      expect(session.expiresAt).toBeDefined();
    });

    test('validateSession returns session info', () => {
      const created = adapter.createSession({
        userId: testUserId
      });
      
      const session = adapter.validateSession(created.token);
      
      expect(session).not.toBeNull();
      expect(session.userId).toBe(testUserId);
      expect(session.user.email).toBe('session@example.com');
    });

    test('validateSession returns null for invalid token', () => {
      const session = adapter.validateSession('invalidtoken');
      expect(session).toBeNull();
    });

    test('deleteSession removes session', () => {
      const created = adapter.createSession({
        userId: testUserId
      });
      
      const result = adapter.deleteSession(created.token);
      
      expect(result.changes).toBe(1);
      expect(adapter.validateSession(created.token)).toBeNull();
    });

    test('deleteUserSessions removes all sessions for user', () => {
      adapter.createSession({ userId: testUserId });
      adapter.createSession({ userId: testUserId });
      adapter.createSession({ userId: testUserId });
      
      const result = adapter.deleteUserSessions(testUserId);
      
      expect(result.changes).toBe(3);
    });

    test('session includes user agent and IP when provided', () => {
      const created = adapter.createSession({
        userId: testUserId,
        userAgent: 'TestAgent/1.0',
        ipAddress: '127.0.0.1'
      });
      
      expect(created.token).toBeDefined();
    });
  });

  // =================== Events ===================

  describe('events', () => {
    let testUserId;
    let testContentId;

    beforeEach(() => {
      const result = adapter.createUser({
        email: 'events@example.com',
        password: 'testpassword123'
      });
      testUserId = result.id;
      
      // Create a content_storage row for foreign key reference
      const contentResult = db.prepare('INSERT INTO content_storage (http_response_id) VALUES (NULL)').run();
      testContentId = contentResult.lastInsertRowid;
    });

    test('recordEvent creates event', () => {
      const result = adapter.recordEvent({
        userId: testUserId,
        eventType: 'article_view',
        contentId: testContentId,
        durationMs: 5000
      });
      
      expect(result.id).toBeDefined();
    });

    test('recordEvent with metadata', () => {
      adapter.recordEvent({
        userId: testUserId,
        eventType: 'search_query',
        metadata: { query: 'test search' }
      });
      
      const events = adapter.getRecentEvents(testUserId, 1);
      
      expect(events[0].metadata).toEqual({ query: 'test search' });
    });

    test('getRecentEvents returns events in order', () => {
      adapter.recordEvent({ userId: testUserId, eventType: 'first' });
      adapter.recordEvent({ userId: testUserId, eventType: 'second' });
      adapter.recordEvent({ userId: testUserId, eventType: 'third' });
      
      const events = adapter.getRecentEvents(testUserId, 3);
      
      expect(events.length).toBe(3);
      // Events returned in insertion order by ID (ascending)
      // Check that we have all three events
      const types = events.map(e => e.eventType).sort();
      expect(types).toEqual(['first', 'second', 'third']);
    });

    test('getEventsByType filters by type', () => {
      adapter.recordEvent({ userId: testUserId, eventType: 'article_view' });
      adapter.recordEvent({ userId: testUserId, eventType: 'search_query' });
      adapter.recordEvent({ userId: testUserId, eventType: 'article_view' });
      
      const views = adapter.getEventsByType(testUserId, 'article_view', 10);
      
      expect(views.length).toBe(2);
      expect(views.every(e => e.eventType === 'article_view')).toBe(true);
    });

    test('bulkRecordEvents records multiple events', () => {
      const events = [
        { userId: testUserId, eventType: 'event1' },
        { userId: testUserId, eventType: 'event2' },
        { userId: testUserId, eventType: 'event3' }
      ];
      
      const result = adapter.bulkRecordEvents(events);
      
      expect(result.recorded).toBe(3);
    });
  });

  // =================== Preferences ===================

  describe('preferences', () => {
    let testUserId;

    beforeEach(() => {
      const result = adapter.createUser({
        email: 'prefs@example.com',
        password: 'testpassword123'
      });
      testUserId = result.id;
    });

    test('savePreferences creates preferences', () => {
      adapter.savePreferences({
        userId: testUserId,
        categoryWeights: { technology: 0.5, sports: 0.3 },
        topicWeights: { ai: 0.4 }
      });
      
      const prefs = adapter.getPreferences(testUserId);
      
      expect(prefs).not.toBeNull();
      expect(prefs.categoryWeights.technology).toBe(0.5);
      expect(prefs.topicWeights.ai).toBe(0.4);
    });

    test('savePreferences updates existing preferences', () => {
      adapter.savePreferences({
        userId: testUserId,
        categoryWeights: { technology: 0.5 }
      });
      
      adapter.savePreferences({
        userId: testUserId,
        categoryWeights: { technology: 0.8, sports: 0.2 }
      });
      
      const prefs = adapter.getPreferences(testUserId);
      
      expect(prefs.categoryWeights.technology).toBe(0.8);
      expect(prefs.categoryWeights.sports).toBe(0.2);
    });

    test('getPreferences returns null for user without preferences', () => {
      const prefs = adapter.getPreferences(testUserId);
      expect(prefs).toBeNull();
    });

    test('deletePreferences removes preferences', () => {
      adapter.savePreferences({
        userId: testUserId,
        categoryWeights: { technology: 0.5 }
      });
      
      adapter.deletePreferences(testUserId);
      
      expect(adapter.getPreferences(testUserId)).toBeNull();
    });
  });

  // =================== Stats ===================

  describe('stats', () => {
    test('getStats returns system statistics', () => {
      // Create some users
      adapter.createUser({ email: 'user1@example.com', password: 'password123' });
      adapter.createUser({ email: 'user2@example.com', password: 'password123' });
      
      const stats = adapter.getStats();
      
      expect(stats.totalUsers).toBe(2);
      expect(typeof stats.activeSessions).toBe('number');
      expect(typeof stats.eventsLast24h).toBe('number');
    });

    test('countUsers returns active user count', () => {
      adapter.createUser({ email: 'user1@example.com', password: 'password123' });
      adapter.createUser({ email: 'user2@example.com', password: 'password123' });
      
      expect(adapter.countUsers()).toBe(2);
    });
  });
});
