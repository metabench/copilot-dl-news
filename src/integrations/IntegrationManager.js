'use strict';

/**
 * Integration manager for third-party services
 * @module integrations/IntegrationManager
 */

const { SlackClient } = require('./SlackClient');

/**
 * Supported integration types
 */
const INTEGRATION_TYPES = ['slack', 'zapier', 'custom_webhook'];

/**
 * Integration manager
 */
class IntegrationManager {
  /**
   * Create an IntegrationManager
   * @param {Object} options - Options
   * @param {Object} options.adapter - Integration adapter
   * @param {Object} [options.logger] - Logger
   * @param {Object} [options.slackClient] - Slack client
   * @param {Object} [options.webhookDelivery] - Webhook delivery service
   */
  constructor({ adapter, logger = console, slackClient, webhookDelivery }) {
    this.adapter = adapter;
    this.logger = logger;
    this.slackClient = slackClient || new SlackClient({ logger });
    this.webhookDelivery = webhookDelivery;
  }

  /**
   * Create an integration
   * @param {number} userId - User ID
   * @param {string} type - Integration type
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} Created integration
   */
  async createIntegration(userId, type, config) {
    // Validate type
    if (!INTEGRATION_TYPES.includes(type)) {
      throw new Error(`Invalid integration type: ${type}. Supported: ${INTEGRATION_TYPES.join(', ')}`);
    }
    
    // Validate config based on type
    this.validateConfig(type, config);
    
    const integration = await this.adapter.createIntegration(userId, type, {
      name: config.name || type,
      config: this.sanitizeConfig(type, config),
      enabled: config.enabled !== false
    });
    
    this.logger.info(`Integration created: ${integration.id} (${type}) for user ${userId}`);
    return integration;
  }

  /**
   * Get an integration by ID
   * @param {number} id - Integration ID
   * @returns {Promise<Object|null>} Integration
   */
  async getIntegration(id) {
    return this.adapter.getIntegration(id);
  }

  /**
   * List integrations for a user
   * @param {number} userId - User ID
   * @param {Object} [options] - Options
   * @returns {Promise<Array>} Integrations
   */
  async listIntegrations(userId, options = {}) {
    return this.adapter.listIntegrations(userId, options);
  }

  /**
   * Update an integration
   * @param {number} id - Integration ID
   * @param {number} userId - User ID (for authorization)
   * @param {Object} updates - Updates
   * @returns {Promise<Object>} Updated integration
   */
  async updateIntegration(id, userId, updates) {
    const integration = await this.adapter.getIntegration(id);
    if (!integration) {
      throw new Error('Integration not found');
    }
    if (integration.userId !== userId) {
      throw new Error('Not authorized to update this integration');
    }
    
    // Validate config if provided
    if (updates.config) {
      this.validateConfig(integration.type, updates.config);
      updates.config = this.sanitizeConfig(integration.type, {
        ...integration.config,
        ...updates.config
      });
    }
    
    const updated = await this.adapter.updateIntegration(id, updates);
    this.logger.info(`Integration updated: ${id}`);
    return updated;
  }

  /**
   * Delete an integration
   * @param {number} id - Integration ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<boolean>} Success
   */
  async deleteIntegration(id, userId) {
    const integration = await this.adapter.getIntegration(id);
    if (!integration) {
      throw new Error('Integration not found');
    }
    if (integration.userId !== userId) {
      throw new Error('Not authorized to delete this integration');
    }
    
    const result = await this.adapter.deleteIntegration(id);
    this.logger.info(`Integration deleted: ${id}`);
    return result;
  }

  /**
   * Trigger an integration
   * @param {number} integrationId - Integration ID
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Result
   */
  async triggerIntegration(integrationId, eventType, data) {
    const integration = await this.adapter.getIntegration(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }
    if (!integration.enabled) {
      return { success: false, reason: 'Integration is disabled' };
    }
    
    switch (integration.type) {
      case 'slack':
        return this.triggerSlack(integration, eventType, data);
      case 'zapier':
        return this.triggerZapier(integration, eventType, data);
      case 'custom_webhook':
        return this.triggerCustomWebhook(integration, eventType, data);
      default:
        throw new Error(`Unknown integration type: ${integration.type}`);
    }
  }

  /**
   * Trigger Slack integration
   * @param {Object} integration - Integration
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Result
   */
  async triggerSlack(integration, eventType, data) {
    const { webhookUrl, channel } = integration.config;
    
    // Format message based on event type
    let message;
    switch (eventType) {
      case 'article:new':
        message = this.slackClient.formatArticle(data);
        break;
      case 'alert:triggered':
        message = this.slackClient.formatAlert(data.alert, data);
        break;
      case 'breaking_news':
        message = this.slackClient.formatBreakingNews(data);
        break;
      case 'crawl:completed':
        message = this.slackClient.formatCrawlCompleted(data);
        break;
      default:
        message = {
          text: `Event: ${eventType}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Event:* ${eventType}\n\`\`\`${JSON.stringify(data, null, 2).substring(0, 500)}\`\`\``
              }
            }
          ]
        };
    }
    
    return this.slackClient.postMessage(webhookUrl, message);
  }

  /**
   * Trigger Zapier integration
   * @param {Object} integration - Integration
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Result
   */
  async triggerZapier(integration, eventType, data) {
    const { webhookUrl } = integration.config;
    
    // Zapier expects a flat payload
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      ...this.flattenObject(data)
    };
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Zapier error: ${response.status}`);
      }
      
      return { success: true };
    } catch (error) {
      this.logger.error('Zapier trigger failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trigger custom webhook integration
   * @param {Object} integration - Integration
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Result
   */
  async triggerCustomWebhook(integration, eventType, data) {
    const { url, headers = {}, method = 'POST' } = integration.config;
    
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data
    };
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }
      
      return { success: true, statusCode: response.status };
    } catch (error) {
      this.logger.error('Custom webhook trigger failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Trigger all integrations for a user on an event
   * @param {number} userId - User ID
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Results
   */
  async triggerAllForUser(userId, eventType, data) {
    const integrations = await this.adapter.listIntegrations(userId, { enabled: true });
    
    if (integrations.length === 0) {
      return { triggered: 0, results: [] };
    }
    
    const results = await Promise.allSettled(
      integrations.map(integration => 
        this.triggerIntegration(integration.id, eventType, data)
      )
    );
    
    return {
      triggered: integrations.length,
      results: results.map((r, i) => ({
        integrationId: integrations[i].id,
        type: integrations[i].type,
        ...(r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message })
      }))
    };
  }

  /**
   * Test an integration
   * @param {number} id - Integration ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Result
   */
  async testIntegration(id, userId) {
    const integration = await this.adapter.getIntegration(id);
    if (!integration) {
      throw new Error('Integration not found');
    }
    if (integration.userId !== userId) {
      throw new Error('Not authorized to test this integration');
    }
    
    const testData = {
      title: 'Test Article',
      url: 'https://example.com/test',
      summary: 'This is a test message from NewsCrawl integration.',
      source: 'Test Source'
    };
    
    return this.triggerIntegration(id, 'test', testData);
  }

  /**
   * Validate configuration for an integration type
   * @param {string} type - Integration type
   * @param {Object} config - Configuration
   */
  validateConfig(type, config) {
    switch (type) {
      case 'slack':
        if (!config.webhookUrl) {
          throw new Error('Slack webhook URL is required');
        }
        if (!config.webhookUrl.startsWith('https://hooks.slack.com/')) {
          throw new Error('Invalid Slack webhook URL');
        }
        break;
        
      case 'zapier':
        if (!config.webhookUrl) {
          throw new Error('Zapier webhook URL is required');
        }
        if (!config.webhookUrl.includes('zapier.com') && !config.webhookUrl.includes('hooks.zapier.com')) {
          throw new Error('Invalid Zapier webhook URL');
        }
        break;
        
      case 'custom_webhook':
        if (!config.url) {
          throw new Error('Webhook URL is required');
        }
        try {
          new URL(config.url);
        } catch {
          throw new Error('Invalid webhook URL');
        }
        break;
    }
  }

  /**
   * Sanitize configuration (remove sensitive data for storage)
   * @param {string} type - Integration type
   * @param {Object} config - Configuration
   * @returns {Object} Sanitized config
   */
  sanitizeConfig(type, config) {
    // For now, store as-is. In production, encrypt sensitive values.
    return { ...config };
  }

  /**
   * Flatten an object for Zapier
   * @param {Object} obj - Object to flatten
   * @param {string} [prefix] - Key prefix
   * @returns {Object} Flattened object
   */
  flattenObject(obj, prefix = '') {
    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        result[newKey] = value.join(', ');
      } else {
        result[newKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Get supported integration types
   * @returns {Array<string>} Types
   */
  static getIntegrationTypes() {
    return [...INTEGRATION_TYPES];
  }
}

module.exports = { IntegrationManager, INTEGRATION_TYPES };
