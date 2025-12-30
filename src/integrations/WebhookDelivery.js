'use strict';

/**
 * Webhook delivery with retry logic
 * @module integrations/WebhookDelivery
 */

const crypto = require('crypto');

/**
 * Retry delays in milliseconds
 */
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Maximum retry attempts
 */
const MAX_ATTEMPTS = 3;

/**
 * Webhook delivery service
 */
class WebhookDelivery {
  /**
   * Create a WebhookDelivery service
   * @param {Object} options - Options
   * @param {Object} options.adapter - Integration adapter
   * @param {Object} [options.logger] - Logger
   * @param {Function} [options.fetch] - Fetch implementation (for testing)
   */
  constructor({ adapter, logger = console, fetch = globalThis.fetch }) {
    this.adapter = adapter;
    this.logger = logger;
    this.fetch = fetch;
  }

  /**
   * Generate HMAC signature for payload
   * @param {string} secret - Webhook secret
   * @param {Object} payload - Payload to sign
   * @returns {string} Signature
   */
  generateSignature(secret, payload) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return 'sha256=' + hmac.digest('hex');
  }

  /**
   * Verify a webhook signature
   * @param {string} secret - Webhook secret
   * @param {Object} payload - Payload
   * @param {string} signature - Signature to verify
   * @returns {boolean} Valid
   */
  verifySignature(secret, payload, signature) {
    const expected = this.generateSignature(secret, payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  /**
   * Deliver a webhook payload
   * @param {Object} webhook - Webhook configuration
   * @param {string} eventType - Event type
   * @param {Object} payload - Payload to deliver
   * @returns {Promise<Object>} Delivery result
   */
  async deliver(webhook, eventType, payload) {
    const deliveryId = crypto.randomUUID();
    const signature = this.generateSignature(webhook.secret, payload);
    
    // Create delivery record
    const delivery = await this.adapter.createDelivery(
      webhook.id,
      eventType,
      payload
    );
    
    const result = await this.attemptDelivery(
      webhook,
      eventType,
      payload,
      deliveryId,
      signature,
      delivery.id
    );
    
    return result;
  }

  /**
   * Attempt delivery with retries
   * @param {Object} webhook - Webhook
   * @param {string} eventType - Event type
   * @param {Object} payload - Payload
   * @param {string} deliveryId - Delivery ID
   * @param {string} signature - HMAC signature
   * @param {number} recordId - Delivery record ID
   * @returns {Promise<Object>} Result
   */
  async attemptDelivery(webhook, eventType, payload, deliveryId, signature, recordId) {
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const attemptNumber = attempt + 1;
      
      try {
        const response = await this.sendRequest(
          webhook.url,
          eventType,
          payload,
          deliveryId,
          signature
        );
        
        const responseBody = await this.getResponseBody(response);
        
        // Update delivery record
        await this.adapter.updateDelivery(recordId, {
          attempts: attemptNumber,
          lastAttemptAt: new Date().toISOString(),
          responseCode: response.status,
          responseBody: responseBody.substring(0, 1000), // Truncate
          status: response.ok ? 'success' : 'failed'
        });
        
        if (response.ok) {
          this.logger.info(`Webhook delivered: ${webhook.id} -> ${eventType}`);
          return {
            success: true,
            deliveryId,
            attempts: attemptNumber,
            statusCode: response.status
          };
        }
        
        lastError = new Error(`HTTP ${response.status}: ${responseBody.substring(0, 200)}`);
        
        // Don't retry on 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          break;
        }
        
      } catch (error) {
        lastError = error;
        
        // Update delivery record with error
        await this.adapter.updateDelivery(recordId, {
          attempts: attemptNumber,
          lastAttemptAt: new Date().toISOString(),
          responseBody: error.message
        });
      }
      
      // Wait before retry (unless last attempt)
      if (attempt < MAX_ATTEMPTS - 1) {
        await this.sleep(RETRY_DELAYS[attempt]);
      }
    }
    
    // Mark as failed after all retries
    await this.adapter.updateDelivery(recordId, {
      status: 'failed'
    });
    
    this.logger.warn(`Webhook delivery failed after ${MAX_ATTEMPTS} attempts: ${webhook.id}`);
    
    return {
      success: false,
      deliveryId,
      attempts: MAX_ATTEMPTS,
      error: lastError?.message || 'Unknown error'
    };
  }

  /**
   * Send HTTP request
   * @param {string} url - Target URL
   * @param {string} eventType - Event type
   * @param {Object} payload - Payload
   * @param {string} deliveryId - Delivery ID
   * @param {string} signature - HMAC signature
   * @returns {Promise<Response>} Response
   */
  async sendRequest(url, eventType, payload, deliveryId, signature) {
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Event-Type': eventType,
        'X-Delivery-ID': deliveryId,
        'User-Agent': 'NewsCrawl-Webhook/1.0'
      },
      body: JSON.stringify(payload),
      timeout: 30000
    });
    
    return response;
  }

  /**
   * Get response body safely
   * @param {Response} response - Response
   * @returns {Promise<string>} Body text
   */
  async getResponseBody(response) {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  /**
   * Sleep for a duration
   * @param {number} ms - Milliseconds
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Trigger webhooks for an event
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @returns {Promise<Object>} Results
   */
  async triggerEvent(eventType, payload) {
    const webhooks = await this.adapter.getWebhooksForEvent(eventType);
    
    if (webhooks.length === 0) {
      return { triggered: 0, results: [] };
    }
    
    const enrichedPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload
    };
    
    const results = await Promise.allSettled(
      webhooks.map(webhook => this.deliver(webhook, eventType, enrichedPayload))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    
    this.logger.info(`Event ${eventType}: ${successful} delivered, ${failed} failed`);
    
    return {
      triggered: webhooks.length,
      successful,
      failed,
      results: results.map((r, i) => ({
        webhookId: webhooks[i].id,
        ...(r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message })
      }))
    };
  }

  /**
   * Retry pending deliveries
   * @returns {Promise<Object>} Results
   */
  async retryPending() {
    const pending = await this.adapter.getPendingDeliveries();
    
    if (pending.length === 0) {
      return { retried: 0, results: [] };
    }
    
    const results = [];
    
    for (const delivery of pending) {
      const webhook = await this.adapter.getWebhook
        ? await this.adapter.getWebhook(delivery.webhookId)
        : null;
      
      if (!webhook || !webhook.enabled) {
        await this.adapter.updateDelivery(delivery.id, { status: 'cancelled' });
        continue;
      }
      
      const signature = this.generateSignature(webhook.secret, delivery.payload);
      const deliveryId = crypto.randomUUID();
      
      const result = await this.attemptDelivery(
        webhook,
        delivery.eventType,
        delivery.payload,
        deliveryId,
        signature,
        delivery.id
      );
      
      results.push({ deliveryId: delivery.id, ...result });
    }
    
    return { retried: results.length, results };
  }
}

module.exports = { WebhookDelivery, RETRY_DELAYS, MAX_ATTEMPTS };
