'use strict';

const { createIntegrationAdapter } = require('../../src/data/db/sqlite/v1/queries/integrationAdapter');

// Mock database
function createMockDb() {
  const tables = {
    webhooks: [],
    webhook_deliveries: [],
    integrations: []
  };
  let nextId = { webhooks: 1, webhook_deliveries: 1, integrations: 1 };

  return {
    tables,
    run: jest.fn(async (sql, params = []) => {
      if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
        return { changes: 0 };
      }
      
      if (sql.includes('INSERT INTO webhooks')) {
        const id = nextId.webhooks++;
        tables.webhooks.push({
          id,
          user_id: params[0],
          name: params[1],
          url: params[2],
          secret: params[3],
          events: params[4],
          enabled: params[5],
          created_at: params[6],
          updated_at: params[7]
        });
        return { lastID: id, changes: 1 };
      }
      
      if (sql.includes('INSERT INTO webhook_deliveries')) {
        const id = nextId.webhook_deliveries++;
        tables.webhook_deliveries.push({
          id,
          webhook_id: params[0],
          event_type: params[1],
          payload: params[2],
          status: 'pending',
          attempts: 0,
          created_at: params[3]
        });
        return { lastID: id, changes: 1 };
      }
      
      if (sql.includes('INSERT INTO integrations')) {
        const id = nextId.integrations++;
        tables.integrations.push({
          id,
          user_id: params[0],
          type: params[1],
          name: params[2],
          config: params[3],
          enabled: params[4],
          created_at: params[5],
          updated_at: params[6]
        });
        return { lastID: id, changes: 1 };
      }
      
      if (sql.includes('UPDATE webhooks')) {
        const id = params[params.length - 1];
        const webhook = tables.webhooks.find(w => w.id === id);
        if (webhook) {
          // Parse the SET clause to update fields
          if (sql.includes('name =')) webhook.name = params[0];
          if (sql.includes('enabled =')) webhook.enabled = params[0];
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      
      if (sql.includes('UPDATE webhook_deliveries')) {
        const id = params[params.length - 1];
        const delivery = tables.webhook_deliveries.find(d => d.id === id);
        if (delivery) {
          // Update based on params
          let idx = 0;
          if (sql.includes('status =')) delivery.status = params[idx++];
          if (sql.includes('attempts =')) delivery.attempts = params[idx++];
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      
      if (sql.includes('DELETE FROM webhooks')) {
        const id = params[0];
        const idx = tables.webhooks.findIndex(w => w.id === id);
        if (idx >= 0) {
          tables.webhooks.splice(idx, 1);
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      
      if (sql.includes('UPDATE integrations')) {
        const id = params[params.length - 1];
        const integration = tables.integrations.find(i => i.id === id);
        if (integration) {
          // Parse the SET clause to update fields
          let idx = 0;
          if (sql.includes('name =')) integration.name = params[idx++];
          if (sql.includes('config =')) integration.config = params[idx++];
          if (sql.includes('enabled =')) integration.enabled = params[idx++];
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      
      if (sql.includes('DELETE FROM integrations')) {
        const id = params[0];
        const idx = tables.integrations.findIndex(i => i.id === id);
        if (idx >= 0) {
          tables.integrations.splice(idx, 1);
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      
      return { changes: 0 };
    }),
    
    get: jest.fn(async (sql, params = []) => {
      if (sql.includes('FROM webhooks')) {
        return tables.webhooks.find(w => w.id === params[0]) || null;
      }
      if (sql.includes('FROM webhook_deliveries')) {
        return tables.webhook_deliveries.find(d => d.id === params[0]) || null;
      }
      if (sql.includes('FROM integrations')) {
        return tables.integrations.find(i => i.id === params[0]) || null;
      }
      return null;
    }),
    
    all: jest.fn(async (sql, params = []) => {
      // Check GROUP BY first (most specific)
      if (sql.includes('GROUP BY status')) {
        const counts = {};
        tables.webhook_deliveries
          .filter(d => d.webhook_id === params[0])
          .forEach(d => {
            counts[d.status] = (counts[d.status] || 0) + 1;
          });
        return Object.entries(counts).map(([status, count]) => ({ status, count }));
      }
      if (sql.includes('FROM webhooks') && sql.includes('user_id = ?')) {
        return tables.webhooks.filter(w => w.user_id === params[0]);
      }
      if (sql.includes('FROM webhooks') && sql.includes('enabled = 1')) {
        return tables.webhooks.filter(w => w.enabled === 1);
      }
      if (sql.includes('FROM webhook_deliveries') && sql.includes('webhook_id = ?')) {
        return tables.webhook_deliveries.filter(d => d.webhook_id === params[0]);
      }
      if (sql.includes('FROM webhook_deliveries') && sql.includes('status = \'pending\'')) {
        return tables.webhook_deliveries.filter(d => d.status === 'pending' && d.attempts < 3);
      }
      if (sql.includes('FROM integrations') && sql.includes('user_id = ?')) {
        return tables.integrations.filter(i => i.user_id === params[0]);
      }
      return [];
    })
  };
}

describe('integrationAdapter', () => {
  let db;
  let adapter;

  beforeEach(async () => {
    db = createMockDb();
    adapter = createIntegrationAdapter(db);
    await adapter.initTables();
  });

  describe('initTables', () => {
    it('should create all tables and indexes', async () => {
      expect(db.run).toHaveBeenCalled();
      const calls = db.run.mock.calls.map(c => c[0]);
      expect(calls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS webhooks'))).toBe(true);
      expect(calls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS webhook_deliveries'))).toBe(true);
      expect(calls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS integrations'))).toBe(true);
    });
  });

  describe('webhooks', () => {
    it('should create a webhook', async () => {
      const webhook = await adapter.createWebhook(1, {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['article:new', 'alert:triggered']
      });

      expect(webhook).toBeDefined();
      expect(webhook.id).toBe(1);
      expect(webhook.name).toBe('Test Webhook');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toEqual(['article:new', 'alert:triggered']);
      expect(webhook.secret).toBeDefined();
      expect(webhook.enabled).toBe(true);
    });

    it('should get a webhook by ID', async () => {
      await adapter.createWebhook(1, {
        name: 'Test',
        url: 'https://example.com/webhook',
        events: ['article:new']
      });

      const webhook = await adapter.getWebhook(1);
      expect(webhook).toBeDefined();
      expect(webhook.name).toBe('Test');
    });

    it('should list webhooks for a user', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createWebhook(1, { name: 'W2', url: 'https://b.com', events: ['alert:triggered'] });
      await adapter.createWebhook(2, { name: 'W3', url: 'https://c.com', events: ['article:new'] });

      const webhooks = await adapter.listWebhooks(1);
      expect(webhooks.length).toBe(2);
    });

    it('should get webhooks for an event type', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createWebhook(1, { name: 'W2', url: 'https://b.com', events: ['alert:triggered'] });

      const webhooks = await adapter.getWebhooksForEvent('article:new');
      expect(webhooks.length).toBe(1);
      expect(webhooks[0].name).toBe('W1');
    });

    it('should update a webhook', async () => {
      await adapter.createWebhook(1, { name: 'Original', url: 'https://a.com', events: ['article:new'] });

      await adapter.updateWebhook(1, { name: 'Updated' });
      const webhook = await adapter.getWebhook(1);
      expect(webhook.name).toBe('Updated');
    });

    it('should delete a webhook', async () => {
      await adapter.createWebhook(1, { name: 'Test', url: 'https://a.com', events: ['article:new'] });

      const result = await adapter.deleteWebhook(1);
      expect(result).toBe(true);
    });

    it('should generate unique secrets', () => {
      const secret1 = adapter.generateSecret();
      const secret2 = adapter.generateSecret();
      
      expect(secret1).toBeDefined();
      expect(secret1.length).toBe(32);
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('deliveries', () => {
    it('should create a delivery', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      
      const delivery = await adapter.createDelivery(1, 'article:new', { title: 'Test' });
      
      expect(delivery).toBeDefined();
      expect(delivery.webhookId).toBe(1);
      expect(delivery.eventType).toBe('article:new');
      expect(delivery.status).toBe('pending');
    });

    it('should list deliveries for a webhook', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createDelivery(1, 'article:new', { a: 1 });
      await adapter.createDelivery(1, 'article:new', { a: 2 });

      const deliveries = await adapter.listDeliveries(1);
      expect(deliveries.length).toBe(2);
    });

    it('should update a delivery', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createDelivery(1, 'article:new', { a: 1 });

      await adapter.updateDelivery(1, { status: 'success', attempts: 1 });
      const delivery = await adapter.getDelivery(1);
      expect(delivery.status).toBe('success');
    });

    it('should get pending deliveries', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createDelivery(1, 'article:new', { a: 1 });

      const pending = await adapter.getPendingDeliveries();
      expect(pending.length).toBe(1);
    });

    it('should get delivery stats', async () => {
      await adapter.createWebhook(1, { name: 'W1', url: 'https://a.com', events: ['article:new'] });
      await adapter.createDelivery(1, 'article:new', { a: 1 });
      await adapter.createDelivery(1, 'article:new', { a: 2 });

      const stats = await adapter.getDeliveryStats(1);
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
    });
  });

  describe('integrations', () => {
    it('should create an integration', async () => {
      const integration = await adapter.createIntegration(1, 'slack', {
        name: 'My Slack',
        config: { webhookUrl: 'https://hooks.slack.com/xxx' }
      });

      expect(integration).toBeDefined();
      expect(integration.type).toBe('slack');
      expect(integration.config).toEqual({ webhookUrl: 'https://hooks.slack.com/xxx' });
    });

    it('should list integrations for a user', async () => {
      await adapter.createIntegration(1, 'slack', { config: { url: 'a' } });
      await adapter.createIntegration(1, 'zapier', { config: { url: 'b' } });

      const integrations = await adapter.listIntegrations(1);
      expect(integrations.length).toBe(2);
    });

    it('should update an integration', async () => {
      await adapter.createIntegration(1, 'slack', { name: 'Original', config: { url: 'a' } });

      await adapter.updateIntegration(1, { enabled: false });
      const integration = await adapter.getIntegration(1);
      expect(integration.enabled).toBe(false);
    });

    it('should delete an integration', async () => {
      await adapter.createIntegration(1, 'slack', { config: { url: 'a' } });

      const result = await adapter.deleteIntegration(1);
      expect(result).toBe(true);
    });
  });
});

