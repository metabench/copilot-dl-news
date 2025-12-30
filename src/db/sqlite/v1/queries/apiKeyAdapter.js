'use strict';

/**
 * API Key Database Adapter
 * 
 * Handles CRUD operations for API keys with bcrypt-style hashing.
 * Supports tiered access (free/premium/unlimited) with rate limiting.
 * 
 * @module apiKeyAdapter
 */

const crypto = require('crypto');

/**
 * Rate limits by tier (requests per minute)
 */
const TIER_RATE_LIMITS = {
  free: 100,
  premium: 1000,
  unlimited: Infinity
};

/**
 * Hash an API key using SHA-256
 * We use SHA-256 instead of bcrypt for API keys since:
 * 1. API keys are high-entropy random strings (not user passwords)
 * 2. We need fast lookup on every request
 * 3. The key format includes sufficient entropy (32 hex chars)
 * 
 * @param {string} key - Raw API key
 * @returns {string} Hashed key
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Generate a new API key
 * Format: dlnews_<32 random hex characters>
 * 
 * @returns {{key: string, prefix: string, hash: string}}
 */
function generateApiKey() {
  const randomPart = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  const key = `dlnews_${randomPart}`;
  const prefix = key.substring(0, 15); // "dlnews_" + first 8 hex chars
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

/**
 * Ensure the api_keys table exists
 * @param {import('better-sqlite3').Database} db
 */
function ensureApiKeysSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureApiKeysSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'premium', 'unlimited')),
      name TEXT,
      owner_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      requests_today INTEGER NOT NULL DEFAULT 0,
      requests_reset_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      revoked_at TEXT,
      revoke_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
    CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
  `);
}

/**
 * Create API key adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} API key adapter methods
 */
function createApiKeyAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createApiKeyAdapter requires a better-sqlite3 database handle');
  }

  ensureApiKeysSchema(db);

  // Prepared statements
  const stmts = {
    getByHash: db.prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1
    `),
    
    getById: db.prepare(`
      SELECT * FROM api_keys WHERE id = ?
    `),
    
    getAll: db.prepare(`
      SELECT id, key_prefix, tier, name, owner_email, created_at, last_used_at, 
             requests_today, is_active, revoked_at
      FROM api_keys 
      ORDER BY created_at DESC
      LIMIT ?
    `),
    
    create: db.prepare(`
      INSERT INTO api_keys (key_hash, key_prefix, tier, name, owner_email, created_at)
      VALUES (@key_hash, @key_prefix, @tier, @name, @owner_email, @created_at)
    `),
    
    updateLastUsed: db.prepare(`
      UPDATE api_keys 
      SET last_used_at = @last_used_at
      WHERE id = @id
    `),
    
    incrementRequests: db.prepare(`
      UPDATE api_keys 
      SET requests_today = requests_today + 1,
          requests_reset_date = @reset_date,
          last_used_at = @last_used_at
      WHERE id = @id
    `),
    
    resetDailyRequests: db.prepare(`
      UPDATE api_keys 
      SET requests_today = 1,
          requests_reset_date = @reset_date,
          last_used_at = @last_used_at
      WHERE id = @id
    `),
    
    revoke: db.prepare(`
      UPDATE api_keys 
      SET is_active = 0, 
          revoked_at = @revoked_at, 
          revoke_reason = @reason
      WHERE id = @id
    `),
    
    updateTier: db.prepare(`
      UPDATE api_keys 
      SET tier = @tier
      WHERE id = @id
    `),
    
    getStats: db.prepare(`
      SELECT 
        tier,
        COUNT(*) as count,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_count,
        SUM(requests_today) as total_requests_today
      FROM api_keys
      GROUP BY tier
    `)
  };

  return {
    /**
     * Validate an API key and return its metadata
     * @param {string} rawKey - Raw API key from request
     * @returns {Object|null} Key metadata or null if invalid
     */
    validateKey(rawKey) {
      if (!rawKey || typeof rawKey !== 'string') {
        return null;
      }
      
      // Check format
      if (!rawKey.startsWith('dlnews_') || rawKey.length !== 39) {
        return null;
      }
      
      const hash = hashApiKey(rawKey);
      const row = stmts.getByHash.get(hash);
      
      if (!row) {
        return null;
      }
      
      return this._normalizeRow(row);
    },

    /**
     * Record a request for rate limiting
     * @param {number} keyId - API key ID
     * @returns {Object} Updated rate limit info
     */
    recordRequest(keyId) {
      const now = new Date();
      const todayDate = now.toISOString().split('T')[0];
      const lastUsedAt = now.toISOString();
      
      // Get current key state
      const key = stmts.getById.get(keyId);
      if (!key) {
        return null;
      }
      
      // Check if we need to reset daily counter
      if (key.requests_reset_date !== todayDate) {
        stmts.resetDailyRequests.run({
          id: keyId,
          reset_date: todayDate,
          last_used_at: lastUsedAt
        });
        return {
          requestsToday: 1,
          resetDate: todayDate,
          limit: TIER_RATE_LIMITS[key.tier] || 100
        };
      }
      
      // Increment counter
      stmts.incrementRequests.run({
        id: keyId,
        reset_date: todayDate,
        last_used_at: lastUsedAt
      });
      
      return {
        requestsToday: key.requests_today + 1,
        resetDate: todayDate,
        limit: TIER_RATE_LIMITS[key.tier] || 100
      };
    },

    /**
     * Check if key is within rate limit
     * @param {Object} keyData - Key metadata from validateKey
     * @returns {{allowed: boolean, limit: number, remaining: number, resetAt: Date}}
     */
    checkRateLimit(keyData) {
      if (!keyData) {
        return { allowed: false, limit: 0, remaining: 0, resetAt: new Date() };
      }
      
      const limit = TIER_RATE_LIMITS[keyData.tier] || 100;
      const todayDate = new Date().toISOString().split('T')[0];
      
      // Get fresh request count
      const freshKey = stmts.getById.get(keyData.id);
      let requestsToday = 0;
      
      if (freshKey && freshKey.requests_reset_date === todayDate) {
        requestsToday = freshKey.requests_today;
      }
      
      // Calculate reset time (next minute for per-minute limiting)
      const now = new Date();
      const resetAt = new Date(now);
      resetAt.setSeconds(0, 0);
      resetAt.setMinutes(resetAt.getMinutes() + 1);
      
      const allowed = limit === Infinity || requestsToday < limit;
      const remaining = limit === Infinity ? Infinity : Math.max(0, limit - requestsToday);
      
      return {
        allowed,
        limit: limit === Infinity ? -1 : limit,
        remaining: limit === Infinity ? -1 : remaining,
        resetAt
      };
    },

    /**
     * Create a new API key
     * @param {Object} options - Key options
     * @param {string} [options.tier='free'] - Access tier
     * @param {string} [options.name] - Friendly name
     * @param {string} [options.ownerEmail] - Owner email
     * @returns {Object} Created key info (includes raw key - only time it's available!)
     */
    createKey({ tier = 'free', name = null, ownerEmail = null } = {}) {
      const { key, prefix, hash } = generateApiKey();
      const now = new Date().toISOString();
      
      const result = stmts.create.run({
        key_hash: hash,
        key_prefix: prefix,
        tier,
        name,
        owner_email: ownerEmail,
        created_at: now
      });
      
      return {
        id: result.lastInsertRowid,
        key, // Raw key - only returned on creation!
        prefix,
        tier,
        name,
        ownerEmail,
        createdAt: now
      };
    },

    /**
     * Revoke an API key
     * @param {number} id - Key ID
     * @param {string} [reason] - Revocation reason
     * @returns {boolean} Success
     */
    revokeKey(id, reason = null) {
      const result = stmts.revoke.run({
        id,
        revoked_at: new Date().toISOString(),
        reason
      });
      return result.changes > 0;
    },

    /**
     * Update key tier
     * @param {number} id - Key ID
     * @param {string} tier - New tier
     * @returns {boolean} Success
     */
    updateTier(id, tier) {
      if (!['free', 'premium', 'unlimited'].includes(tier)) {
        throw new Error(`Invalid tier: ${tier}`);
      }
      const result = stmts.updateTier.run({ id, tier });
      return result.changes > 0;
    },

    /**
     * Get all API keys (without hashes)
     * @param {number} [limit=100] - Max keys to return
     * @returns {Array} API keys
     */
    listKeys(limit = 100) {
      return stmts.getAll.all(limit).map(row => this._normalizeRow(row));
    },

    /**
     * Get key by ID
     * @param {number} id - Key ID
     * @returns {Object|null} Key data
     */
    getById(id) {
      const row = stmts.getById.get(id);
      return row ? this._normalizeRow(row) : null;
    },

    /**
     * Get usage statistics
     * @returns {Object} Stats by tier
     */
    getStats() {
      const rows = stmts.getStats.all();
      return {
        byTier: rows.map(row => ({
          tier: row.tier,
          totalKeys: row.count,
          activeKeys: row.active_count,
          requestsToday: row.total_requests_today || 0
        })),
        totalKeys: rows.reduce((sum, r) => sum + r.count, 0),
        activeKeys: rows.reduce((sum, r) => sum + r.active_count, 0)
      };
    },

    /**
     * Get tier rate limits
     * @returns {Object} Rate limits by tier
     */
    getTierLimits() {
      return { ...TIER_RATE_LIMITS };
    },

    /**
     * Normalize a database row to JS object
     * @private
     */
    _normalizeRow(row) {
      if (!row) return null;
      return {
        id: row.id,
        prefix: row.key_prefix,
        tier: row.tier,
        name: row.name,
        ownerEmail: row.owner_email,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        requestsToday: row.requests_today || 0,
        requestsResetDate: row.requests_reset_date,
        isActive: row.is_active === 1,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason
      };
    }
  };
}

module.exports = {
  createApiKeyAdapter,
  ensureApiKeysSchema,
  generateApiKey,
  hashApiKey,
  TIER_RATE_LIMITS
};
