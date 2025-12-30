'use strict';

/**
 * @fileoverview Tests for Push Notification Routes
 */

const express = require('express');
const request = require('supertest');
const { createPushRouter } = require('../../../src/api/v1/routes/push');

describe('Push API Routes', () => {
  let app;
  let mockPushAdapter;
  let mockUserService;
  let mockWebPush;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    mockPushAdapter = {
      saveSubscription: jest.fn().mockResolvedValue(1),
      getSubscriptionByEndpoint: jest.fn(),
      getSubscriptionsByUser: jest.fn().mockResolvedValue([]),
      getSubscriptionsByUsers: jest.fn().mockResolvedValue([]),
      deleteSubscription: jest.fn().mockResolvedValue(true),
      getStats: jest.fn().mockResolvedValue({
        totalSubscriptions: 10,
        activeUsers: 5
      })
    };

    mockUserService = {
      validateSession: jest.fn().mockReturnValue({
        valid: true,
        userId: 1
      })
    };

    mockWebPush = {
      setVapidDetails: jest.fn(),
      sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 })
    };

    app = express();
    app.use(express.json());
  });

  function mountRouter(config = {}) {
    const router = createPushRouter({
      pushAdapter: mockPushAdapter,
      userService: mockUserService,
      webPush: mockWebPush,
      config: {
        vapidPublicKey: 'test-public-key',
        vapidPrivateKey: 'test-private-key',
        vapidEmail: 'mailto:test@example.com',
        ...config
      },
      logger: mockLogger
    });
    app.use('/api/v1/push', router);
  }

  describe('GET /api/v1/push/vapid-key', () => {
    test('returns public VAPID key', async () => {
      mountRouter();

      const res = await request(app)
        .get('/api/v1/push/vapid-key')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.publicKey).toBe('test-public-key');
    });

    test('returns 503 when not configured', async () => {
      const router = createPushRouter({
        pushAdapter: mockPushAdapter,
        config: {},
        logger: mockLogger
      });
      app.use('/api/v1/push', router);

      const res = await request(app)
        .get('/api/v1/push/vapid-key')
        .expect(503);

      expect(res.body.error).toContain('not configured');
    });
  });

  describe('GET /api/v1/push/status', () => {
    test('returns push status', async () => {
      mountRouter();

      const res = await request(app)
        .get('/api/v1/push/status')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.status.enabled).toBe(true);
      expect(res.body.status.configured).toBe(true);
    });
  });

  describe('POST /api/v1/push/subscribe', () => {
    const validSubscription = {
      subscription: {
        endpoint: 'https://push.example.com/endpoint/abc123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key'
        }
      }
    };

    test('registers subscription successfully', async () => {
      mountRouter();

      const res = await request(app)
        .post('/api/v1/push/subscribe')
        .send(validSubscription)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.subscriptionId).toBe(1);
      expect(mockPushAdapter.saveSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: validSubscription.subscription.endpoint,
          p256dh: validSubscription.subscription.keys.p256dh,
          auth: validSubscription.subscription.keys.auth
        })
      );
    });

    test('rejects invalid subscription object', async () => {
      mountRouter();

      const res = await request(app)
        .post('/api/v1/push/subscribe')
        .send({ subscription: { endpoint: 'test' } })
        .expect(400);

      expect(res.body.error).toContain('Invalid subscription');
    });

    test('rejects missing keys', async () => {
      mountRouter();

      const res = await request(app)
        .post('/api/v1/push/subscribe')
        .send({
          subscription: {
            endpoint: 'https://push.example.com/test',
            keys: {}
          }
        })
        .expect(400);

      expect(res.body.error).toContain('Missing encryption keys');
    });

    test('associates with user when authenticated', async () => {
      mountRouter();

      await request(app)
        .post('/api/v1/push/subscribe')
        .set('x-session-id', 'valid-session')
        .send(validSubscription)
        .expect(201);

      expect(mockPushAdapter.saveSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1
        })
      );
    });
  });

  describe('DELETE /api/v1/push/subscribe', () => {
    test('unregisters subscription successfully', async () => {
      mountRouter();

      const res = await request(app)
        .delete('/api/v1/push/subscribe')
        .send({ endpoint: 'https://push.example.com/endpoint/abc123' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe(true);
      expect(mockPushAdapter.deleteSubscription).toHaveBeenCalled();
    });

    test('rejects missing endpoint', async () => {
      mountRouter();

      const res = await request(app)
        .delete('/api/v1/push/subscribe')
        .send({})
        .expect(400);

      expect(res.body.error).toContain('Endpoint is required');
    });
  });

  describe('GET /api/v1/push/subscriptions', () => {
    test('requires authentication', async () => {
      mockUserService.validateSession.mockReturnValue(null);
      mountRouter();

      await request(app)
        .get('/api/v1/push/subscriptions')
        .expect(401);
    });

    test('returns user subscriptions', async () => {
      mockPushAdapter.getSubscriptionsByUser.mockResolvedValue([
        {
          id: 1,
          endpoint: 'https://push.example.com/endpoint/abc123456789',
          userAgent: 'Chrome',
          createdAt: '2025-12-26T10:00:00Z'
        }
      ]);
      mountRouter();

      const res = await request(app)
        .get('/api/v1/push/subscriptions')
        .set('x-session-id', 'valid-session')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
      expect(res.body.subscriptions[0].id).toBe(1);
    });
  });

  describe('POST /api/v1/push/test', () => {
    test('requires authentication', async () => {
      mockUserService.validateSession.mockReturnValue(null);
      mountRouter();

      await request(app)
        .post('/api/v1/push/test')
        .expect(401);
    });

    test('returns 404 when user has no subscriptions', async () => {
      mountRouter();

      const res = await request(app)
        .post('/api/v1/push/test')
        .set('x-session-id', 'valid-session')
        .expect(404);

      expect(res.body.error).toContain('No push subscriptions');
    });

    test('sends test notification', async () => {
      mockPushAdapter.getSubscriptionsByUser.mockResolvedValue([
        {
          id: 1,
          endpoint: 'https://push.example.com/endpoint/1',
          p256dh: 'key1',
          auth: 'auth1'
        }
      ]);
      mountRouter();

      const res = await request(app)
        .post('/api/v1/push/test')
        .set('x-session-id', 'valid-session')
        .send({ title: 'Test', body: 'Test notification' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.sent).toBe(1);
      expect(mockWebPush.sendNotification).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/push/stats', () => {
    test('returns statistics', async () => {
      mountRouter();

      const res = await request(app)
        .get('/api/v1/push/stats')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.stats.totalSubscriptions).toBe(10);
      expect(res.body.stats.activeUsers).toBe(5);
    });
  });
});
