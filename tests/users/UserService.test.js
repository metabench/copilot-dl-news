'use strict';

/**
 * @fileoverview Tests for UserService
 */

const { UserService, EVENT_TYPES } = require('../../src/users/UserService');

describe('UserService', () => {
  let service;
  let mockAdapter;
  let mockLogger;

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = {
      createUser: jest.fn(),
      getUserById: jest.fn(),
      getUserByEmail: jest.fn(),
      authenticateUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      verifyEmail: jest.fn(),
      createSession: jest.fn(),
      validateSession: jest.fn(),
      deleteSession: jest.fn(),
      deleteUserSessions: jest.fn(),
      cleanupExpiredSessions: jest.fn(),
      recordEvent: jest.fn(),
      getRecentEvents: jest.fn(),
      deleteOldEvents: jest.fn(),
      getStats: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    service = new UserService({
      userAdapter: mockAdapter,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    test('requires userAdapter', () => {
      expect(() => new UserService({})).toThrow('requires a userAdapter');
    });

    test('uses default logger if not provided', () => {
      const svc = new UserService({ userAdapter: mockAdapter });
      expect(svc.logger).toBeDefined();
    });
  });

  // =================== Registration ===================

  describe('register', () => {
    test('creates user successfully', async () => {
      mockAdapter.getUserByEmail.mockReturnValue(null);
      mockAdapter.createUser.mockReturnValue({
        id: 1,
        email: 'test@example.com',
        verificationToken: 'abc123'
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'testpassword123'
      });

      expect(result.id).toBe(1);
      expect(result.email).toBe('test@example.com');
      expect(result.message).toContain('Registration successful');
      expect(mockAdapter.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com',
        password: 'testpassword123'
      }));
    });

    test('rejects invalid email', async () => {
      await expect(service.register({
        email: 'notanemail',
        password: 'testpassword123'
      })).rejects.toThrow('Invalid email');
    });

    test('rejects short password', async () => {
      await expect(service.register({
        email: 'test@example.com',
        password: 'short'
      })).rejects.toThrow('at least 8 characters');
    });

    test('rejects existing email', async () => {
      mockAdapter.getUserByEmail.mockReturnValue({ id: 1, email: 'test@example.com' });

      await expect(service.register({
        email: 'test@example.com',
        password: 'testpassword123'
      })).rejects.toThrow('already registered');
    });
  });

  // =================== Login ===================

  describe('login', () => {
    test('authenticates and creates session', async () => {
      mockAdapter.authenticateUser.mockReturnValue({
        id: 1,
        email: 'test@example.com',
        displayName: 'Test User',
        settings: {}
      });
      mockAdapter.createSession.mockReturnValue({
        token: 'session-token-123',
        expiresAt: '2025-12-27T00:00:00Z'
      });
      mockAdapter.recordEvent.mockReturnValue({ id: 1 });

      const result = await service.login({
        email: 'test@example.com',
        password: 'correctpassword'
      });

      expect(result.token).toBe('session-token-123');
      expect(result.user.id).toBe(1);
      expect(result.user.email).toBe('test@example.com');
    });

    test('rejects invalid credentials', async () => {
      mockAdapter.authenticateUser.mockReturnValue(null);

      await expect(service.login({
        email: 'test@example.com',
        password: 'wrongpassword'
      })).rejects.toThrow('Invalid email or password');
    });

    test('records login event', async () => {
      mockAdapter.authenticateUser.mockReturnValue({
        id: 1,
        email: 'test@example.com',
        settings: {}
      });
      mockAdapter.createSession.mockReturnValue({
        token: 'token',
        expiresAt: '2025-12-27T00:00:00Z'
      });
      mockAdapter.recordEvent.mockReturnValue({ id: 1 });

      await service.login({
        email: 'test@example.com',
        password: 'password'
      });

      expect(mockAdapter.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        eventType: EVENT_TYPES.LOGIN
      }));
    });
  });

  // =================== Logout ===================

  describe('logout', () => {
    test('deletes session', async () => {
      mockAdapter.validateSession.mockReturnValue({
        userId: 1,
        user: { id: 1 }
      });
      mockAdapter.deleteSession.mockReturnValue({ changes: 1 });
      mockAdapter.recordEvent.mockReturnValue({ id: 1 });

      const result = await service.logout('session-token');

      expect(result.success).toBe(true);
      expect(mockAdapter.deleteSession).toHaveBeenCalledWith('session-token');
    });

    test('returns false for missing token', async () => {
      const result = await service.logout(null);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No token');
    });
  });

  // =================== Session Validation ===================

  describe('validateSession', () => {
    test('returns user for valid session', () => {
      mockAdapter.validateSession.mockReturnValue({
        userId: 1,
        user: {
          id: 1,
          email: 'test@example.com',
          displayName: 'Test',
          isActive: true
        }
      });

      const user = service.validateSession('valid-token');

      expect(user).not.toBeNull();
      expect(user.id).toBe(1);
    });

    test('returns null for invalid session', () => {
      mockAdapter.validateSession.mockReturnValue(null);

      const user = service.validateSession('invalid-token');

      expect(user).toBeNull();
    });

    test('returns null for empty token', () => {
      const user = service.validateSession('');

      expect(user).toBeNull();
    });
  });

  // =================== Profile ===================

  describe('updateProfile', () => {
    test('updates display name', async () => {
      mockAdapter.getUserById.mockReturnValue({
        id: 1,
        email: 'test@example.com',
        displayName: 'Old Name',
        settings: {}
      });
      mockAdapter.updateUser.mockReturnValue({ changes: 1 });

      const result = await service.updateProfile(1, { displayName: 'New Name' });

      expect(mockAdapter.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
        displayName: 'New Name'
      }));
    });

    test('throws for non-existent user', async () => {
      mockAdapter.getUserById.mockReturnValue(null);

      await expect(service.updateProfile(999, { displayName: 'Name' }))
        .rejects.toThrow('User not found');
    });
  });

  // =================== Event Tracking ===================

  describe('recordEvent', () => {
    test('records article view event', () => {
      mockAdapter.recordEvent.mockReturnValue({ id: 1 });

      service.recordArticleView(1, 123, { source: 'feed' });

      expect(mockAdapter.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        eventType: EVENT_TYPES.ARTICLE_VIEW,
        contentId: 123
      }));
    });

    test('records article complete event', () => {
      mockAdapter.recordEvent.mockReturnValue({ id: 1 });

      service.recordArticleComplete(1, 123, 60000);

      expect(mockAdapter.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        eventType: EVENT_TYPES.ARTICLE_COMPLETE,
        contentId: 123,
        durationMs: 60000
      }));
    });
  });

  // =================== Stats ===================

  describe('getStats', () => {
    test('returns statistics', () => {
      mockAdapter.getStats.mockReturnValue({
        totalUsers: 100,
        activeSessions: 50,
        eventsLast24h: 1000,
        usersWithPreferences: 75
      });

      const stats = service.getStats();

      expect(stats.totalUsers).toBe(100);
      expect(stats.activeSessions).toBe(50);
    });
  });

  // =================== Maintenance ===================

  describe('cleanupExpiredSessions', () => {
    test('cleans up sessions', () => {
      mockAdapter.cleanupExpiredSessions.mockReturnValue({ deleted: 10 });

      const result = service.cleanupExpiredSessions();

      expect(result.deleted).toBe(10);
      expect(mockAdapter.cleanupExpiredSessions).toHaveBeenCalled();
    });
  });
});
