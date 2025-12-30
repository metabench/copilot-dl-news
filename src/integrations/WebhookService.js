'use strict';

/**
 * Webhook management service
 * @module integrations/WebhookService
 */

const crypto = require('crypto');

/**
 * Event types supported by webhooks
 */
const EVENT_TYPES = [
  'article:new',
  'article:updated',
  'alert:triggered',
  'breaking_news',
  'crawl:completed',
  'export:ready'
];

/**
 * Webhook service for managing webhook subscriptions
 */
class WebhookService {
  /**
   * Create a WebhookService
   * @param {Object} options - Options
   * @param {Object} options.adapter - Integration adapter
   * @param {Object} [options.logger] - Logger
   */
  constructor({ adapter, logger = console }) {
    this.adapter = adapter;
    this.logger = logger;
  }

  /**
   * Create a new webhook
   * @param {number} userId - User ID
   * @param {Object} data - Webhook data
   * @param {string} data.name - Webhook name
   * @param {string} data.url - Endpoint URL
   * @param {Array<string>} data.events - Event types to subscribe to
   * @returns {Promise<Object>} Created webhook
   */
  async createWebhook(userId, { name, url, events }) {
    // Validate URL
    if (!this.isValidUrl(url)) {
      throw new Error('Invalid webhook URL');
    }
    
    // Validate events
    const invalidEvents = events.filter(e => !EVENT_TYPES.includes(e));
    if (invalidEvents.length > 0) {
      throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
    }
    
    if (events.length === 0) {
      throw new Error('At least one event type is required');
    }
    
    const webhook = await this.adapter.createWebhook(userId, {
      name,
      url,
      events,
      enabled: true
    });
    
    this.logger.info(`Webhook created: ${webhook.id} for user ${userId}`);
    return webhook;
  }

  /**
   * Get a webhook by ID
   * @param {number} id - Webhook ID
   * @returns {Promise<Object|null>} Webhook
   */
  async getWebhook(id) {
    return this.adapter.getWebhook(id);
  }

  /**
   * List webhooks for a user
   * @param {number} userId - User ID
   * @param {Object} [options] - Options
   * @returns {Promise<Array>} Webhooks
   */
  async listWebhooks(userId, options = {}) {
    return this.adapter.listWebhooks(userId, options);
  }

  /**
   * Update a webhook
   * @param {number} id - Webhook ID
   * @param {number} userId - User ID (for authorization)
   * @param {Object} updates - Updates
   * @returns {Promise<Object>} Updated webhook
   */
  async updateWebhook(id, userId, updates) {
    const webhook = await this.adapter.getWebhook(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    if (webhook.userId !== userId) {
      throw new Error('Not authorized to update this webhook');
    }
    
    // Validate URL if provided
    if (updates.url && !this.isValidUrl(updates.url)) {
      throw new Error('Invalid webhook URL');
    }
    
    // Validate events if provided
    if (updates.events) {
      const invalidEvents = updates.events.filter(e => !EVENT_TYPES.includes(e));
      if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(', ')}`);
      }
      if (updates.events.length === 0) {
        throw new Error('At least one event type is required');
      }
    }
    
    const updated = await this.adapter.updateWebhook(id, updates);
    this.logger.info(`Webhook updated: ${id}`);
    return updated;
  }

  /**
   * Delete a webhook
   * @param {number} id - Webhook ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<boolean>} Success
   */
  async deleteWebhook(id, userId) {
    const webhook = await this.adapter.getWebhook(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    if (webhook.userId !== userId) {
      throw new Error('Not authorized to delete this webhook');
    }
    
    const result = await this.adapter.deleteWebhook(id);
    this.logger.info(`Webhook deleted: ${id}`);
    return result;
  }

  /**
   * Get webhooks subscribed to an event type
   * @param {string} eventType - Event type
   * @returns {Promise<Array>} Webhooks
   */
  async getWebhooksForEvent(eventType) {
    return this.adapter.getWebhooksForEvent(eventType);
  }

  /**
   * Regenerate secret for a webhook
   * @param {number} id - Webhook ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<Object>} Webhook with new secret
   */
  async regenerateSecret(id, userId) {
    const webhook = await this.adapter.getWebhook(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    if (webhook.userId !== userId) {
      throw new Error('Not authorized to update this webhook');
    }
    
    const newSecret = this.adapter.generateSecret();
    // We need to update the secret directly in DB
    // For now, we'll use a workaround through update
    await this.adapter.updateWebhook(id, { secret: newSecret });
    
    this.logger.info(`Webhook secret regenerated: ${id}`);
    return this.adapter.getWebhook(id);
  }

  /**
   * Test a webhook by sending a test payload
   * @param {number} id - Webhook ID
   * @param {number} userId - User ID (for authorization)
   * @param {Object} delivery - Webhook delivery service
   * @returns {Promise<Object>} Delivery result
   */
  async testWebhook(id, userId, delivery) {
    const webhook = await this.adapter.getWebhook(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    if (webhook.userId !== userId) {
      throw new Error('Not authorized to test this webhook');
    }
    
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      message: 'This is a test webhook delivery'
    };
    
    return delivery.deliver(webhook, 'test', testPayload);
  }

  /**
   * Get delivery history for a webhook
   * @param {number} webhookId - Webhook ID
   * @param {Object} [options] - Options
   * @returns {Promise<Array>} Deliveries
   */
  async getDeliveries(webhookId, options = {}) {
    return this.adapter.listDeliveries(webhookId, options);
  }

  /**
   * Get delivery stats for a webhook
   * @param {number} webhookId - Webhook ID
   * @returns {Promise<Object>} Stats
   */
  async getDeliveryStats(webhookId) {
    return this.adapter.getDeliveryStats(webhookId);
  }

  /**
   * Validate a URL
   * @param {string} url - URL to validate
   * @returns {boolean} Valid
   */
  isValidUrl(url) {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Get supported event types
   * @returns {Array<string>} Event types
   */
  static getEventTypes() {
    return [...EVENT_TYPES];
  }
}

module.exports = { WebhookService, EVENT_TYPES };
