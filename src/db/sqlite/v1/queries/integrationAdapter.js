'use strict';

/**
 * Database adapter for webhooks and integrations
 * @module db/sqlite/v1/queries/integrationAdapter
 */

const crypto = require('crypto');

/**
 * Generate a random secret for webhook signing
 * @returns {string} 32-character hex secret
 */
function generateSecret() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create the integration adapter
 * @param {Object} db - Database connection
 * @returns {Object} Integration adapter methods
 */
function createIntegrationAdapter(db) {
  
  /**
   * Initialize tables
   */
  async function initTables() {
    await db.run(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_attempt_at TEXT,
        response_code INTEGER,
        response_body TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
      )
    `);
    
    await db.run(`
      CREATE TABLE IF NOT EXISTS integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id)`);
  }

  // ==================== WEBHOOKS ====================

  /**
   * Create a webhook
   * @param {number} userId - User ID
   * @param {Object} data - Webhook data
   * @returns {Promise<Object>} Created webhook
   */
  async function createWebhook(userId, { name, url, events, enabled = true }) {
    const secret = generateSecret();
    const eventsJson = JSON.stringify(events);
    const now = new Date().toISOString();
    
    const result = await db.run(
      `INSERT INTO webhooks (user_id, name, url, secret, events, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, url, secret, eventsJson, enabled ? 1 : 0, now, now]
    );
    
    return getWebhook(result.lastID);
  }

  /**
   * Get a webhook by ID
   * @param {number} id - Webhook ID
   * @returns {Promise<Object|null>} Webhook or null
   */
  async function getWebhook(id) {
    const row = await db.get('SELECT * FROM webhooks WHERE id = ?', [id]);
    return row ? formatWebhook(row) : null;
  }

  /**
   * List webhooks for a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Webhooks
   */
  async function listWebhooks(userId, { enabled, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM webhooks WHERE user_id = ?';
    const params = [userId];
    
    if (enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(enabled ? 1 : 0);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await db.all(sql, params);
    return rows.map(formatWebhook);
  }

  /**
   * Get webhooks subscribed to an event type
   * @param {string} eventType - Event type
   * @returns {Promise<Array>} Matching webhooks
   */
  async function getWebhooksForEvent(eventType) {
    const rows = await db.all(
      `SELECT * FROM webhooks WHERE enabled = 1`,
      []
    );
    
    return rows
      .map(formatWebhook)
      .filter(webhook => webhook.events.includes(eventType));
  }

  /**
   * Update a webhook
   * @param {number} id - Webhook ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated webhook
   */
  async function updateWebhook(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      params.push(updates.url);
    }
    if (updates.events !== undefined) {
      fields.push('events = ?');
      params.push(JSON.stringify(updates.events));
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    
    if (fields.length === 0) return getWebhook(id);
    
    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    await db.run(
      `UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    
    return getWebhook(id);
  }

  /**
   * Delete a webhook
   * @param {number} id - Webhook ID
   * @returns {Promise<boolean>} Success
   */
  async function deleteWebhook(id) {
    const result = await db.run('DELETE FROM webhooks WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * Format webhook row
   */
  function formatWebhook(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      url: row.url,
      secret: row.secret,
      events: JSON.parse(row.events || '[]'),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== DELIVERIES ====================

  /**
   * Create a delivery record
   * @param {number} webhookId - Webhook ID
   * @param {string} eventType - Event type
   * @param {Object} payload - Payload
   * @returns {Promise<Object>} Created delivery
   */
  async function createDelivery(webhookId, eventType, payload) {
    const now = new Date().toISOString();
    
    const result = await db.run(
      `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, attempts, created_at)
       VALUES (?, ?, ?, 'pending', 0, ?)`,
      [webhookId, eventType, JSON.stringify(payload), now]
    );
    
    return getDelivery(result.lastID);
  }

  /**
   * Get a delivery by ID
   * @param {number} id - Delivery ID
   * @returns {Promise<Object|null>} Delivery or null
   */
  async function getDelivery(id) {
    const row = await db.get('SELECT * FROM webhook_deliveries WHERE id = ?', [id]);
    return row ? formatDelivery(row) : null;
  }

  /**
   * List deliveries for a webhook
   * @param {number} webhookId - Webhook ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Deliveries
   */
  async function listDeliveries(webhookId, { status, limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM webhook_deliveries WHERE webhook_id = ?';
    const params = [webhookId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await db.all(sql, params);
    return rows.map(formatDelivery);
  }

  /**
   * Update a delivery
   * @param {number} id - Delivery ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated delivery
   */
  async function updateDelivery(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      params.push(updates.status);
    }
    if (updates.attempts !== undefined) {
      fields.push('attempts = ?');
      params.push(updates.attempts);
    }
    if (updates.lastAttemptAt !== undefined) {
      fields.push('last_attempt_at = ?');
      params.push(updates.lastAttemptAt);
    }
    if (updates.responseCode !== undefined) {
      fields.push('response_code = ?');
      params.push(updates.responseCode);
    }
    if (updates.responseBody !== undefined) {
      fields.push('response_body = ?');
      params.push(updates.responseBody);
    }
    
    if (fields.length === 0) return getDelivery(id);
    
    params.push(id);
    
    await db.run(
      `UPDATE webhook_deliveries SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    
    return getDelivery(id);
  }

  /**
   * Get pending deliveries for retry
   * @param {number} limit - Max deliveries
   * @returns {Promise<Array>} Pending deliveries
   */
  async function getPendingDeliveries(limit = 100) {
    const rows = await db.all(
      `SELECT * FROM webhook_deliveries 
       WHERE status = 'pending' AND attempts < 3
       ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
    return rows.map(formatDelivery);
  }

  /**
   * Format delivery row
   */
  function formatDelivery(row) {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload || '{}'),
      status: row.status,
      attempts: row.attempts,
      lastAttemptAt: row.last_attempt_at,
      responseCode: row.response_code,
      responseBody: row.response_body,
      createdAt: row.created_at
    };
  }

  // ==================== INTEGRATIONS ====================

  /**
   * Create an integration
   * @param {number} userId - User ID
   * @param {string} type - Integration type
   * @param {Object} config - Configuration
   * @returns {Promise<Object>} Created integration
   */
  async function createIntegration(userId, type, { name, config, enabled = true }) {
    const now = new Date().toISOString();
    
    const result = await db.run(
      `INSERT INTO integrations (user_id, type, name, config, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, name || type, JSON.stringify(config), enabled ? 1 : 0, now, now]
    );
    
    return getIntegration(result.lastID);
  }

  /**
   * Get an integration by ID
   * @param {number} id - Integration ID
   * @returns {Promise<Object|null>} Integration or null
   */
  async function getIntegration(id) {
    const row = await db.get('SELECT * FROM integrations WHERE id = ?', [id]);
    return row ? formatIntegration(row) : null;
  }

  /**
   * List integrations for a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Integrations
   */
  async function listIntegrations(userId, { type, enabled, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM integrations WHERE user_id = ?';
    const params = [userId];
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(enabled ? 1 : 0);
    }
    
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = await db.all(sql, params);
    return rows.map(formatIntegration);
  }

  /**
   * Update an integration
   * @param {number} id - Integration ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object|null>} Updated integration
   */
  async function updateIntegration(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.config !== undefined) {
      fields.push('config = ?');
      params.push(JSON.stringify(updates.config));
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    
    if (fields.length === 0) return getIntegration(id);
    
    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    
    await db.run(
      `UPDATE integrations SET ${fields.join(', ')} WHERE id = ?`,
      params
    );
    
    return getIntegration(id);
  }

  /**
   * Delete an integration
   * @param {number} id - Integration ID
   * @returns {Promise<boolean>} Success
   */
  async function deleteIntegration(id) {
    const result = await db.run('DELETE FROM integrations WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * Format integration row
   */
  function formatIntegration(row) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      name: row.name,
      config: JSON.parse(row.config || '{}'),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== STATS ====================

  /**
   * Get delivery stats for a webhook
   * @param {number} webhookId - Webhook ID
   * @returns {Promise<Object>} Stats
   */
  async function getDeliveryStats(webhookId) {
    const rows = await db.all(
      `SELECT status, COUNT(*) as count FROM webhook_deliveries 
       WHERE webhook_id = ? GROUP BY status`,
      [webhookId]
    );
    
    const stats = { pending: 0, success: 0, failed: 0, total: 0 };
    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }
    return stats;
  }

  return {
    initTables,
    // Webhooks
    createWebhook,
    getWebhook,
    listWebhooks,
    getWebhooksForEvent,
    updateWebhook,
    deleteWebhook,
    // Deliveries
    createDelivery,
    getDelivery,
    listDeliveries,
    updateDelivery,
    getPendingDeliveries,
    getDeliveryStats,
    // Integrations
    createIntegration,
    getIntegration,
    listIntegrations,
    updateIntegration,
    deleteIntegration,
    // Utilities
    generateSecret
  };
}

module.exports = { createIntegrationAdapter };
