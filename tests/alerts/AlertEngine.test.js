'use strict';

/**
 * Tests for AlertEngine
 */

const { AlertEngine } = require('../../src/alerts/AlertEngine');
const { 
  sampleArticles, 
  sampleRules,
  createMockAlertAdapter,
  createMockEventBroadcaster,
  createMockUserAdapter
} = require('./fixtures');

describe('AlertEngine', () => {
  let engine;
  let mockAdapter;
  let mockBroadcaster;
  let mockUserAdapter;

  beforeEach(() => {
    mockAdapter = createMockAlertAdapter();
    mockBroadcaster = createMockEventBroadcaster();
    mockUserAdapter = createMockUserAdapter();

    engine = new AlertEngine({
      alertAdapter: mockAdapter,
      eventBroadcaster: mockBroadcaster,
      userAdapter: mockUserAdapter,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
    });
  });

  afterEach(() => {
    if (engine._initialized) {
      engine.stop();
    }
  });

  describe('init()', () => {
    test('initializes successfully', async () => {
      const result = await engine.init();
      expect(result).toBe(true);
      expect(engine._initialized).toBe(true);
    });

    test('subscribes to event broadcaster', async () => {
      await engine.init();
      expect(mockBroadcaster._subscribers.length).toBeGreaterThan(0);
    });

    test('does not re-initialize if already initialized', async () => {
      await engine.init();
      await engine.init();
      expect(mockBroadcaster._subscribers.length).toBe(1);
    });
  });

  describe('processNewArticle()', () => {
    test('processes article and returns result', async () => {
      const result = await engine.processNewArticle(sampleArticles.techNews);
      
      expect(result).toHaveProperty('processed', true);
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('isBreaking');
    });

    test('evaluates all enabled rules', async () => {
      await engine.processNewArticle(sampleArticles.techNews);
      
      const stats = engine.getStats();
      expect(stats.rulesEvaluated).toBeGreaterThan(0);
    });

    test('detects breaking news', async () => {
      const result = await engine.processNewArticle(sampleArticles.breakingNews);
      
      expect(result.isBreaking).toBe(true);
    });

    test('creates notifications for matching rules', async () => {
      await engine.processNewArticle(sampleArticles.techNews);
      
      // Check that notifications were created
      const notifications = mockAdapter.getNotificationsByUser(1);
      expect(notifications.length).toBeGreaterThan(0);
    });

    test('respects disabled rules', async () => {
      // Disable all rules except one
      Object.values(mockAdapter._rules).forEach(rule => {
        if (rule.id !== sampleRules.keywordAlert.id) {
          rule.enabled = false;
        }
      });

      await engine.processNewArticle(sampleArticles.techNews);
      
      const stats = engine.getStats();
      // Should only evaluate the one enabled rule
      expect(stats.rulesEvaluated).toBe(1);
    });
  });

  describe('Event handling', () => {
    test('processes article:new events', async () => {
      await engine.init();
      
      await mockBroadcaster.emit('article:new', sampleArticles.techNews);
      
      const stats = engine.getStats();
      expect(stats.articlesProcessed).toBe(1);
    });

    test('processes article:classified events', async () => {
      await engine.init();
      
      await mockBroadcaster.emit('article:classified', sampleArticles.techNews);
      
      const stats = engine.getStats();
      expect(stats.articlesProcessed).toBe(1);
    });
  });

  describe('Rule CRUD operations', () => {
    describe('createRule()', () => {
      test('creates valid rule', () => {
        const result = engine.createRule({
          userId: 1,
          name: 'Test Rule',
          conditions: { type: 'keyword_match', keywords: ['test'] },
          channels: ['inApp']
        });

        expect(result.valid).toBe(true);
        expect(result.id).toBeDefined();
      });

      test('rejects invalid rule', () => {
        const result = engine.createRule({
          userId: 1,
          name: 'Invalid Rule',
          conditions: { type: 'unknown_type' }
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
      });
    });

    describe('getRules()', () => {
      test('returns user rules', () => {
        const rules = engine.getRules(1);
        expect(Array.isArray(rules)).toBe(true);
        expect(rules.length).toBeGreaterThan(0);
      });

      test('filters by user ID', () => {
        const user1Rules = engine.getRules(1);
        const user2Rules = engine.getRules(2);
        
        user1Rules.forEach(rule => expect(rule.userId).toBe(1));
        user2Rules.forEach(rule => expect(rule.userId).toBe(2));
      });
    });

    describe('getRule()', () => {
      test('returns specific rule', () => {
        const rule = engine.getRule(sampleRules.keywordAlert.id);
        expect(rule).toBeDefined();
        expect(rule.name).toBe('Apple News');
      });

      test('returns null for non-existent rule', () => {
        const rule = engine.getRule(99999);
        expect(rule).toBeUndefined();
      });
    });

    describe('updateRule()', () => {
      test('updates rule', () => {
        const result = engine.updateRule(sampleRules.keywordAlert.id, {
          name: 'Updated Name'
        });

        expect(result.success).toBe(true);
        
        const rule = engine.getRule(sampleRules.keywordAlert.id);
        expect(rule.name).toBe('Updated Name');
      });

      test('validates conditions on update', () => {
        const result = engine.updateRule(sampleRules.keywordAlert.id, {
          conditions: { type: 'invalid_type' }
        });

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
      });
    });

    describe('deleteRule()', () => {
      test('deletes rule', () => {
        const result = engine.deleteRule(sampleRules.keywordAlert.id);
        expect(result.success).toBe(true);
        
        const rule = engine.getRule(sampleRules.keywordAlert.id);
        expect(rule).toBeUndefined();
      });
    });
  });

  describe('Notifications', () => {
    beforeEach(async () => {
      // Create some notifications
      mockAdapter.createNotification({
        userId: 1,
        title: 'Test 1',
        isRead: false
      });
      mockAdapter.createNotification({
        userId: 1,
        title: 'Test 2',
        isRead: false
      });
    });

    describe('getNotifications()', () => {
      test('returns user notifications', () => {
        const notifications = engine.getNotifications(1);
        expect(notifications.length).toBe(2);
      });
    });

    describe('getUnreadCount()', () => {
      test('returns unread count', () => {
        const count = engine.getUnreadCount(1);
        expect(count).toBe(2);
      });
    });

    describe('markNotificationRead()', () => {
      test('marks notification as read', () => {
        const notifications = engine.getNotifications(1);
        const result = engine.markNotificationRead(notifications[0].id);
        
        expect(result.success).toBe(true);
        expect(engine.getUnreadCount(1)).toBe(1);
      });
    });

    describe('markAllNotificationsRead()', () => {
      test('marks all as read', () => {
        const result = engine.markAllNotificationsRead(1);
        
        expect(result.success).toBe(true);
        expect(result.count).toBe(2);
        expect(engine.getUnreadCount(1)).toBe(0);
      });
    });
  });

  describe('Alert History', () => {
    test('returns alert history', () => {
      // Record some history
      mockAdapter.recordAlert({
        userId: 1,
        ruleId: 1,
        articleId: 1
      });

      const history = engine.getAlertHistory(1);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
    });
  });

  describe('Breaking News', () => {
    test('returns breaking news list', () => {
      const breakingNews = engine.getBreakingNews();
      expect(Array.isArray(breakingNews)).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    describe('stop()', () => {
      test('stops engine and unsubscribes', async () => {
        await engine.init();
        expect(mockBroadcaster._subscribers.length).toBe(1);
        
        engine.stop();
        
        expect(mockBroadcaster._subscribers.length).toBe(0);
        expect(engine._initialized).toBe(false);
      });
    });

    describe('getStats()', () => {
      test('returns comprehensive stats', async () => {
        await engine.init();
        await engine.processNewArticle(sampleArticles.techNews);
        
        const stats = engine.getStats();
        
        expect(stats.articlesProcessed).toBe(1);
        expect(stats).toHaveProperty('rulesEvaluated');
        expect(stats).toHaveProperty('alertsSent');
        expect(stats).toHaveProperty('breakingNewsDetected');
        expect(stats).toHaveProperty('breakingNewsDetector');
        expect(stats).toHaveProperty('notificationService');
        expect(stats).toHaveProperty('initialized', true);
      });
    });

    describe('cleanup()', () => {
      test('cleans up old data', () => {
        const result = engine.cleanup();
        
        expect(result).toHaveProperty('notifications');
      });
    });
  });
});
