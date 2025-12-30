'use strict';

const { IntegrationManager, INTEGRATION_TYPES } = require('../../src/integrations/IntegrationManager');

// Mock adapter
function createMockAdapter() {
  const integrations = new Map();
  let nextId = 1;

  return {
    createIntegration: jest.fn(async (userId, type, data) => {
      const integration = {
        id: nextId++,
        userId,
        type,
        name: data.name || type,
        config: data.config || {},
        enabled: data.enabled !== false,
        createdAt: new Date().toISOString()
      };
      integrations.set(integration.id, integration);
      return integration;
    }),
    
    getIntegration: jest.fn(async (id) => integrations.get(id) || null),
    
    listIntegrations: jest.fn(async (userId, options = {}) => {
      let result = Array.from(integrations.values()).filter(i => i.userId === userId);
      if (options.enabled !== undefined) {
        result = result.filter(i => i.enabled === options.enabled);
      }
      return result;
    }),
    
    updateIntegration: jest.fn(async (id, updates) => {
      const integration = integrations.get(id);
      if (integration) {
        Object.assign(integration, updates);
        return integration;
      }
      return null;
    }),
    
    deleteIntegration: jest.fn(async (id) => integrations.delete(id))
  };
}

// Mock Slack client
function createMockSlackClient() {
  return {
    postMessage: jest.fn().mockResolvedValue({ success: true }),
    formatArticle: jest.fn().mockReturnValue({ text: 'Article', blocks: [] }),
    formatAlert: jest.fn().mockReturnValue({ text: 'Alert', blocks: [] }),
    formatBreakingNews: jest.fn().mockReturnValue({ text: 'Breaking', blocks: [] }),
    formatCrawlCompleted: jest.fn().mockReturnValue({ text: 'Crawl', blocks: [] })
  };
}

// Mock webhook delivery
function createMockWebhookDelivery() {
  return {
    deliver: jest.fn().mockResolvedValue({ success: true })
  };
}

describe('IntegrationManager', () => {
  let adapter;
  let slackClient;
  let webhookDelivery;
  let manager;

  beforeEach(() => {
    adapter = createMockAdapter();
    slackClient = createMockSlackClient();
    webhookDelivery = createMockWebhookDelivery();
    manager = new IntegrationManager({ 
      adapter, 
      slackClient, 
      webhookDelivery 
    });
  });

  describe('constructor', () => {
    it('should create manager with dependencies', () => {
      expect(manager).toBeDefined();
      expect(manager.adapter).toBe(adapter);
    });

    it('should create default slack client if not provided', () => {
      const managerNoSlack = new IntegrationManager({ adapter });
      expect(managerNoSlack.slackClient).toBeDefined();
    });
  });

  describe('INTEGRATION_TYPES', () => {
    it('should export integration types', () => {
      expect(INTEGRATION_TYPES).toContain('slack');
      expect(INTEGRATION_TYPES).toContain('zapier');
      expect(INTEGRATION_TYPES).toContain('custom_webhook');
    });
  });

  describe('getIntegrationTypes', () => {
    it('should return copy of integration types', () => {
      const types = IntegrationManager.getIntegrationTypes();
      expect(types).toEqual(INTEGRATION_TYPES);
      expect(types).not.toBe(INTEGRATION_TYPES); // Should be a copy
    });
  });

  describe('createIntegration', () => {
    it('should create a Slack integration', async () => {
      const integration = await manager.createIntegration(1, 'slack', {
        name: 'My Slack',
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      expect(integration).toBeDefined();
      expect(integration.type).toBe('slack');
      expect(adapter.createIntegration).toHaveBeenCalled();
    });

    it('should create a Zapier integration', async () => {
      const integration = await manager.createIntegration(1, 'zapier', {
        name: 'My Zapier',
        webhookUrl: 'https://hooks.zapier.com/xxx'
      });

      expect(integration).toBeDefined();
      expect(integration.type).toBe('zapier');
    });

    it('should create a custom webhook integration', async () => {
      const integration = await manager.createIntegration(1, 'custom_webhook', {
        name: 'Custom',
        url: 'https://example.com/webhook',
        headers: { 'X-Custom': 'value' }
      });

      expect(integration).toBeDefined();
      expect(integration.type).toBe('custom_webhook');
    });

    it('should reject invalid integration type', async () => {
      await expect(manager.createIntegration(1, 'invalid', {
        url: 'https://example.com'
      })).rejects.toThrow('Invalid integration type');
    });

    it('should require webhook URL for Slack', async () => {
      await expect(manager.createIntegration(1, 'slack', {
        name: 'Bad Slack'
      })).rejects.toThrow('Slack webhook URL is required');
    });

    it('should validate Slack webhook URL format', async () => {
      await expect(manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://invalid.com/webhook'
      })).rejects.toThrow('Invalid Slack webhook URL');
    });

    it('should require webhook URL for Zapier', async () => {
      await expect(manager.createIntegration(1, 'zapier', {
        name: 'Bad Zapier'
      })).rejects.toThrow('Zapier webhook URL is required');
    });
  });

  describe('getIntegration', () => {
    it('should return integration by ID', async () => {
      await manager.createIntegration(1, 'slack', {
        name: 'Test',
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      const integration = await manager.getIntegration(1);
      expect(integration).toBeDefined();
      expect(integration.type).toBe('slack');
    });

    it('should return null for non-existent integration', async () => {
      const integration = await manager.getIntegration(999);
      expect(integration).toBeNull();
    });
  });

  describe('listIntegrations', () => {
    it('should list all integrations for a user', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });
      await manager.createIntegration(1, 'zapier', {
        webhookUrl: 'https://hooks.zapier.com/xxx'
      });

      const integrations = await manager.listIntegrations(1);
      expect(integrations.length).toBe(2);
    });

    it('should not include other users integrations', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });
      await manager.createIntegration(2, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/yyy'
      });

      const integrations = await manager.listIntegrations(1);
      expect(integrations.length).toBe(1);
    });
  });

  describe('updateIntegration', () => {
    it('should update integration properties', async () => {
      await manager.createIntegration(1, 'slack', {
        name: 'Original',
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      await manager.updateIntegration(1, 1, { name: 'Updated' });
      const integration = await manager.getIntegration(1);
      expect(integration.name).toBe('Updated');
    });

    it('should reject update for non-existent integration', async () => {
      await expect(manager.updateIntegration(999, 1, { name: 'Updated' }))
        .rejects.toThrow('Integration not found');
    });

    it('should reject update from unauthorized user', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      await expect(manager.updateIntegration(1, 2, { name: 'Hacked' }))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('deleteIntegration', () => {
    it('should delete an integration', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      const result = await manager.deleteIntegration(1, 1);
      expect(result).toBe(true);
    });

    it('should reject delete for non-existent integration', async () => {
      await expect(manager.deleteIntegration(999, 1))
        .rejects.toThrow('Integration not found');
    });

    it('should reject delete from unauthorized user', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      await expect(manager.deleteIntegration(1, 2))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('triggerIntegration', () => {
    it('should trigger Slack integration', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      await manager.triggerIntegration(1, 'article:new', {
        title: 'Test Article',
        url: 'https://example.com'
      });

      expect(slackClient.formatArticle).toHaveBeenCalled();
      expect(slackClient.postMessage).toHaveBeenCalled();
    });

    it('should skip disabled integrations', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx',
        enabled: false
      });

      const result = await manager.triggerIntegration(1, 'article:new', { title: 'Test' });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should throw for non-existent integration', async () => {
      await expect(manager.triggerIntegration(999, 'article:new', {}))
        .rejects.toThrow('Integration not found');
    });
  });

  describe('triggerAllForUser', () => {
    it('should trigger all enabled integrations for a user', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });
      await manager.createIntegration(1, 'zapier', {
        webhookUrl: 'https://hooks.zapier.com/xxx'
      });

      const results = await manager.triggerAllForUser(1, 'article:new', { title: 'Test' });

      expect(results.triggered).toBe(2);
      expect(results.results.length).toBe(2);
    });

    it('should return empty results when no integrations exist', async () => {
      const results = await manager.triggerAllForUser(999, 'article:new', { title: 'Test' });

      expect(results.triggered).toBe(0);
      expect(results.results).toEqual([]);
    });
  });

  describe('testIntegration', () => {
    it('should send test message to Slack', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      const result = await manager.testIntegration(1, 1);

      expect(result).toBeDefined();
    });

    it('should reject test from unauthorized user', async () => {
      await manager.createIntegration(1, 'slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      });

      await expect(manager.testIntegration(1, 2))
        .rejects.toThrow('Not authorized');
    });
  });

  describe('validateConfig', () => {
    it('should validate Slack config', () => {
      expect(() => manager.validateConfig('slack', {
        webhookUrl: 'https://hooks.slack.com/services/xxx'
      })).not.toThrow();
    });

    it('should reject invalid Slack URL', () => {
      expect(() => manager.validateConfig('slack', {
        webhookUrl: 'https://example.com'
      })).toThrow('Invalid Slack webhook URL');
    });

    it('should validate Zapier config', () => {
      expect(() => manager.validateConfig('zapier', {
        webhookUrl: 'https://hooks.zapier.com/xxx'
      })).not.toThrow();
    });

    it('should reject invalid Zapier URL', () => {
      expect(() => manager.validateConfig('zapier', {
        webhookUrl: 'https://example.com'
      })).toThrow('Invalid Zapier webhook URL');
    });

    it('should validate custom webhook config', () => {
      expect(() => manager.validateConfig('custom_webhook', {
        url: 'https://example.com/webhook'
      })).not.toThrow();
    });

    it('should require URL for custom webhook', () => {
      expect(() => manager.validateConfig('custom_webhook', {}))
        .toThrow('Webhook URL is required');
    });

    it('should reject invalid custom webhook URL', () => {
      expect(() => manager.validateConfig('custom_webhook', {
        url: 'not-a-url'
      })).toThrow('Invalid webhook URL');
    });
  });

  describe('flattenObject', () => {
    it('should flatten nested objects', () => {
      const nested = {
        user: { name: 'John', email: 'john@example.com' },
        status: 'active'
      };

      const flat = manager.flattenObject(nested);

      expect(flat.user_name).toBe('John');
      expect(flat.user_email).toBe('john@example.com');
      expect(flat.status).toBe('active');
    });

    it('should join arrays', () => {
      const obj = {
        tags: ['news', 'tech', 'ai']
      };

      const flat = manager.flattenObject(obj);

      expect(flat.tags).toBe('news, tech, ai');
    });
  });
});
