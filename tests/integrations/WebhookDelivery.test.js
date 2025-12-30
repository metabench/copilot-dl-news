'use strict';

const { WebhookDelivery, RETRY_DELAYS, MAX_ATTEMPTS } = require('../../src/integrations/WebhookDelivery');

// Mock adapter
function createMockAdapter() {
  const deliveries = new Map();
  let nextId = 1;

  return {
    createDelivery: jest.fn(async (webhookId, eventType, payload) => {
      const delivery = {
        id: nextId++,
        webhookId,
        eventType,
        payload,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString()
      };
      deliveries.set(delivery.id, delivery);
      return delivery;
    }),
    
    getDelivery: jest.fn(async (id) => deliveries.get(id) || null),
    
    updateDelivery: jest.fn(async (id, updates) => {
      const delivery = deliveries.get(id);
      if (delivery) {
        Object.assign(delivery, updates);
        return true;
      }
      return false;
    }),
    
    getWebhook: jest.fn(async (id) => ({
      id,
      url: 'https://example.com/webhook',
      secret: 'whsec_test123',
      enabled: true
    })),
    
    getWebhooksForEvent: jest.fn(async () => []),
    
    getPendingDeliveries: jest.fn(async () => 
      Array.from(deliveries.values()).filter(d => 
        d.status === 'pending' && d.attempts < 3
      )
    )
  };
}

// Mock fetch
function createMockFetch(status = 200, body = 'OK') {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body)
  });
}

describe('WebhookDelivery', () => {
  let adapter;
  let mockFetch;
  let delivery;

  beforeEach(() => {
    adapter = createMockAdapter();
    mockFetch = createMockFetch();
    delivery = new WebhookDelivery({ adapter, fetch: mockFetch });
  });

  describe('constructor', () => {
    it('should create delivery service with adapter', () => {
      expect(delivery).toBeDefined();
      expect(delivery.adapter).toBe(adapter);
    });

    it('should use default retry delays', () => {
      expect(RETRY_DELAYS).toEqual([1000, 5000, 30000]);
    });

    it('should use default max attempts', () => {
      expect(MAX_ATTEMPTS).toBe(3);
    });
  });

  describe('generateSignature', () => {
    it('should generate HMAC-SHA256 signature', () => {
      const signature = delivery.generateSignature('secret', { test: 'data' });

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures for same input', () => {
      const payload = { test: 'data' };
      const sig1 = delivery.generateSignature('secret', payload);
      const sig2 = delivery.generateSignature('secret', payload);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different inputs', () => {
      const sig1 = delivery.generateSignature('secret', { a: 1 });
      const sig2 = delivery.generateSignature('secret', { a: 2 });

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = { test: 'data' };
      const signature = delivery.generateSignature('secret', payload);

      expect(delivery.verifySignature('secret', payload, signature)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = { test: 'data' };
      const wrongSignature = 'sha256=' + 'a'.repeat(64);

      expect(delivery.verifySignature('secret', payload, wrongSignature)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should deliver a webhook payload successfully', async () => {
      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };
      const payload = { title: 'Test Article', url: 'https://example.com' };

      const result = await delivery.deliver(webhook, 'article:new', payload);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.stringMatching(/^sha256=/)
          })
        })
      );
    });

    it('should include event type in headers', async () => {
      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-Event-Type']).toBe('article:new');
    });

    it('should include delivery ID in headers', async () => {
      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-Delivery-ID']).toBeDefined();
    });

    it('should handle delivery failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      const result = await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should handle non-2xx status codes', async () => {
      mockFetch = createMockFetch(500, 'Internal Server Error');
      delivery = new WebhookDelivery({ adapter, fetch: mockFetch });

      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      const result = await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      expect(result.success).toBe(false);
    });

    it('should create delivery record', async () => {
      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      expect(adapter.createDelivery).toHaveBeenCalledWith(
        1,
        'article:new',
        expect.any(Object)
      );
    });

    it('should update delivery record on success', async () => {
      const webhook = {
        id: 1,
        url: 'https://example.com/webhook',
        secret: 'whsec_test123'
      };

      await delivery.deliver(webhook, 'article:new', { title: 'Test' });

      expect(adapter.updateDelivery).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ status: 'success' })
      );
    });
  });

  describe('triggerEvent', () => {
    it('should trigger webhooks for an event', async () => {
      adapter.getWebhooksForEvent.mockResolvedValue([
        { id: 1, url: 'https://a.com/webhook', secret: 'secret1', enabled: true },
        { id: 2, url: 'https://b.com/webhook', secret: 'secret2', enabled: true }
      ]);

      const result = await delivery.triggerEvent('article:new', { title: 'Test' });

      expect(result.triggered).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return results for each webhook', async () => {
      adapter.getWebhooksForEvent.mockResolvedValue([
        { id: 1, url: 'https://a.com/webhook', secret: 'secret1', enabled: true }
      ]);

      const result = await delivery.triggerEvent('article:new', { title: 'Test' });

      expect(result.results.length).toBe(1);
      expect(result.results[0].webhookId).toBe(1);
    });

    it('should return empty results when no webhooks', async () => {
      adapter.getWebhooksForEvent.mockResolvedValue([]);

      const result = await delivery.triggerEvent('article:new', { title: 'Test' });

      expect(result.triggered).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should enrich payload with event metadata', async () => {
      adapter.getWebhooksForEvent.mockResolvedValue([
        { id: 1, url: 'https://a.com/webhook', secret: 'secret1', enabled: true }
      ]);

      await delivery.triggerEvent('article:new', { title: 'Test' });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.event).toBe('article:new');
      expect(body.timestamp).toBeDefined();
      expect(body.data).toEqual({ title: 'Test' });
    });
  });

  describe('retryPending', () => {
    it('should retry pending deliveries', async () => {
      adapter.getPendingDeliveries.mockResolvedValue([
        { id: 1, webhookId: 1, eventType: 'article:new', payload: { title: 'Test' }, attempts: 1 }
      ]);

      const result = await delivery.retryPending();

      expect(result.retried).toBe(1);
    });

    it('should return empty when no pending deliveries', async () => {
      adapter.getPendingDeliveries.mockResolvedValue([]);

      const result = await delivery.retryPending();

      expect(result.retried).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('sleep', () => {
    it('should return a promise', () => {
      const result = delivery.sleep(100);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
