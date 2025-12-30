'use strict';

/**
 * Integrations module exports
 * @module integrations
 */

const { WebhookService, EVENT_TYPES } = require('./WebhookService');
const { WebhookDelivery, RETRY_DELAYS, MAX_ATTEMPTS } = require('./WebhookDelivery');
const { SlackClient } = require('./SlackClient');
const { IntegrationManager, INTEGRATION_TYPES } = require('./IntegrationManager');

module.exports = {
  // Services
  WebhookService,
  WebhookDelivery,
  SlackClient,
  IntegrationManager,
  
  // Constants
  EVENT_TYPES,
  RETRY_DELAYS,
  MAX_ATTEMPTS,
  INTEGRATION_TYPES
};
