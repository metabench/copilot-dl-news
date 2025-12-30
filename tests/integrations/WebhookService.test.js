'use strict';

const { WebhookService, EVENT_TYPES } = require('../../src/integrations/WebhookService');

// Mock adapter
function createMockAdapter() {
  const webhooks = new Map();
  let nextId = 1;

  return {
    createWebhook: jest.fn(async (userId, data) => {
      const webhook = {
        id: nextId++,
        userId,
        name: data.name,
        url: data.url,
        secret: 'whsec_test123',
        events: data.events,
        enabled: data.enabled ?? true,
        createdAt: new Date().toISOString()
      };
      webhooks.set(webhook.id, webhook);
      return webhook;
    }),
    
    getWebhook: jest.fn(async (id) => webhooks.get(id) || null),
    
    listWebhooks: jest.fn(async (userId) => 
      Array.from(webhooks.values()).filter(w => w.userId === userId)
    ),
    
    updateWebhook: jest.fn(async (id, updates) => {
      const webhook = webhooks.get(id);
      if (webhook) {
        Object.assign(webhook, updates);
        return webhook;
      }
      return null;
    }),
    
    deleteWebhook: jest.fn(async (id) => {
      return webhooks.delete(id);
    }),
    
    getWebhooksForEvent: jest.fn(async (eventType) =>
      Array.from(webhooks.values()).filter(w => 
        w.enabled && w.events.includes(eventType)
      )
    ),
    
    generateSecret: jest.fn(() => 'whsec_new_secret_' + Math.random().toString(36).slice(2)),
    
    listDeliveries: jest.fn(async () => []),
    getDeliveryStats: jest.fn(async () => ({ total: 0, success: 0, failed: 0 }))
  };
}

describe('WebhookService', () => {
  let adapter;
  let service;

  beforeEach(() => {
    adapter = createMockAdapter();
    service = new WebhookService({ adapter });
  });

  describe('constructor', () => {
    it('should create service with adapter', () => {
      expect(service).toBeDefined();
      expect(service.adapter).toBe(adapter);
    });
  });

  describe('EVENT_TYPES', () => {
    it('should define valid event types', () => {
      expect(EVENT_TYPES).toContain('article:new');
      expect(EVENT_TYPES).toContain('article:updated');
      expect(EVENT_TYPES).toContain('alert:triggered');
      expect(EVENT_TYPES).toContain('breaking_news');
      expect(EVENT_TYPES).toContain('crawl:completed');
      expect(EVENT_TYPES).toContain('export:ready');
    });
  });

  describe('getEventTypes', () => {
    it('should return event types', () => {
      const types = WebhookService.getEventTypes();
      expect(types).toEqual(EVENT_TYPES);
    });
  });

  describe('createWebhook', () => {
    it('should create a webhook with valid events', async () => {
      const webhook = await service.createWebhook(1, {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['article:new', 'alert:triggered']
      });

      expect(webhook).toBeDefined();
      expect(webhook.name).toBe('Test Webhook');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(adapter.createWebhook).toHaveBeenCalledWith(1, expect.objectContaining({
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['article:new', 'alert:triggered']
      }));
    });

    it('should reject invalid event types', async () => {
      await expect(service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['invalid:event']
      })).rejects.toThrow('Invalid event types');
    });

    it('should reject invalid URLs', async () => {
      await expect(service.createWebhook(1, {
        name: 'Test',
        url: 'not-a-url',
        events: ['article:new']
      })).rejects.toThrow('Invalid webhook URL');
    });

    it('should reject empty events array', async () => {
      await expect(service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: []
      })).rejects.toThrow('At least one event type is required');
    });
  });

  describe('getWebhook', () => {
    it('should return webhook by ID', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      const webhook = await service.getWebhook(1);
      expect(webhook).toBeDefined();
      expect(webhook.name).toBe('Test');
    });

    it('should return null for non-existent webhook', async () => {
      const webhook = await service.getWebhook(999);
      expect(webhook).toBeNull();
    });
  });

  describe('listWebhooks', () => {
    it('should list all webhooks for a user', async () => {
      await service.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await service.createWebhook(1, { name: 'W2', url: 'https://b.com', events: ['alert:triggered'] });
      await service.createWebhook(2, { name: 'W3', url: 'https://c.com', events: ['article:new'] });

      const webhooks = await service.listWebhooks(1);
      expect(webhooks.length).toBe(2);
      expect(webhooks.map(w => w.name)).toEqual(['W1', 'W2']);
    });

    it('should return empty array when user has no webhooks', async () => {
      const webhooks = await service.listWebhooks(999);
      expect(webhooks).toEqual([]);
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook properties', async () => {
      await service.createWebhook(1, {
        name: 'Original',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await service.updateWebhook(1, 1, { name: 'Updated' });
      const webhook = await service.getWebhook(1);
      expect(webhook.name).toBe('Updated');
    });

    it('should validate updated events', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await expect(service.updateWebhook(1, 1, { 
        events: ['invalid:event'] 
      })).rejects.toThrow('Invalid event types');
    });

    it('should validate updated URL', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await expect(service.updateWebhook(1, 1, { 
        url: 'not-a-url' 
      })).rejects.toThrow('Invalid webhook URL');
    });

    it('should reject update from unauthorized user', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await expect(service.updateWebhook(1, 2, { name: 'Hacked' }))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      const result = await service.deleteWebhook(1, 1);
      expect(result).toBe(true);
      
      const webhook = await service.getWebhook(1);
      expect(webhook).toBeNull();
    });

    it('should reject delete from unauthorized user', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await expect(service.deleteWebhook(1, 2))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('getWebhooksForEvent', () => {
    it('should get enabled webhooks for an event type', async () => {
      await service.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await service.createWebhook(1, { name: 'W2', url: 'https://b.com', events: ['alert:triggered'] });
      await service.createWebhook(1, { name: 'W3', url: 'https://c.com', events: ['article:new', 'alert:triggered'] });

      const webhooks = await service.getWebhooksForEvent('article:new');
      expect(webhooks.length).toBe(2);
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid HTTP URLs', () => {
      expect(service.isValidUrl('http://example.com')).toBe(true);
      expect(service.isValidUrl('https://example.com')).toBe(true);
      expect(service.isValidUrl('https://example.com/webhook')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(service.isValidUrl('not-a-url')).toBe(false);
      expect(service.isValidUrl('')).toBe(false);
      expect(service.isValidUrl('ftp://example.com')).toBe(false);
    });
  });

  describe('regenerateSecret', () => {
    it('should regenerate webhook secret', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await service.regenerateSecret(1, 1);
      expect(adapter.updateWebhook).toHaveBeenCalledWith(1, expect.objectContaining({
        secret: expect.any(String)
      }));
    });

    it('should reject regenerate from unauthorized user', async () => {
      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      await expect(service.regenerateSecret(1, 2))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('testWebhook', () => {
    it('should send a test payload to webhook', async () => {
      const mockDelivery = { deliver: jest.fn().mockResolvedValue({ success: true }) };

      await service.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      const result = await service.testWebhook(1, 1, mockDelivery);
      expect(result.success).toBe(true);
      expect(mockDelivery.deliver).toHaveBeenCalled();
    });
  });

  describe('getDeliveries', () => {
    it('should return delivery history', async () => {
      const deliveries = await service.getDeliveries(1);
      expect(Array.isArray(deliveries)).toBe(true);
    });
  });

  describe('getDeliveryStats', () => {
    it('should return delivery statistics', async () => {
      const stats = await service.getDeliveryStats(1);
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('success');
      expect(stats).toHaveProperty('failed');
    });
  });
});
