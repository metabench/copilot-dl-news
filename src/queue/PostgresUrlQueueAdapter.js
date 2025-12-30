'use strict';

const { IUrlQueue } = require('./IUrlQueue');

/**
 * PostgresUrlQueueAdapter — Postgres-backed URL queue for distributed crawling
 * 
 * Designed for multi-worker/multi-process crawling scenarios where multiple
 * crawler instances need to coordinate without duplicating work.
 * 
 * Key features:
 * - FOR UPDATE SKIP LOCKED for atomic, non-blocking dequeue
 * - Connection pooling via pg-pool for efficient connection management
 * - Indexed for fast priority-based queries
 * - Automatic stale worker recovery
 * 
 * STUB MODE:
 * When no real Postgres pool is provided, this adapter operates in stub mode.
 * Stub mode is useful for:
 * - Testing the interface without a running Postgres instance
 * - Developing against the API before infrastructure is ready
 * - CI environments without Postgres
 * 
 * To use with real Postgres:
 * 1. Install pg package: npm install pg
 * 2. Pass a pg.Pool instance or connectionString
 * 
 * @implements {IUrlQueue}
 */
class PostgresUrlQueueAdapter extends IUrlQueue {
  /**
   * @param {Object} options
   * @param {Object} [options.pool] - pg Pool instance (injected for testing/production)
   * @param {string} [options.connectionString] - Postgres connection string
   * @param {string} [options.tableName] - Queue table name (default: 'url_queue')
   * @param {number} [options.poolSize] - Connection pool size (default: 10)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    this.pool = options.pool || null;
    this.connectionString = options.connectionString || process.env.POSTGRES_URL;
    this.tableName = options.tableName || 'url_queue';
    this.poolSize = options.poolSize || 10;
    this.logger = options.logger || console;
    this._initialized = false;
    this._stubMode = false;
    this._ownsPool = false;
  }

  /**
   * @returns {string}
   */
  get backendType() {
    return 'postgres';
  }

  /**
   * Check if running in stub mode (no real Postgres).
   * @returns {boolean}
   */
  get isStubMode() {
    return this._stubMode;
  }

  /**
   * Initialize the queue - create pool and table.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    if (!this.pool) {
      // Try to create a real pool
      if (this.connectionString) {
        try {
          const pg = require('pg');
          this.pool = new pg.Pool({
            connectionString: this.connectionString,
            max: this.poolSize
          });
          this._ownsPool = true;
          this.logger.info('[PostgresUrlQueueAdapter] Connected to Postgres');
        } catch (err) {
          this.logger.warn(`[PostgresUrlQueueAdapter] Failed to connect to Postgres: ${err.message}`);
          this.logger.warn('[PostgresUrlQueueAdapter] Falling back to stub mode');
          this._createStubPool();
        }
      } else {
        this.logger.warn('[PostgresUrlQueueAdapter] No connectionString provided. Using stub mode.');
        this._createStubPool();
      }
    }

    // Create table (will be no-op in stub mode)
    await this._createTable();
    this._initialized = true;
  }

  /**
   * Create a stub pool for testing without actual Postgres.
   * The stub pool stores data in memory with Map/Array.
   * @private
   */
  _createStubPool() {
    this._stubMode = true;
    this._stubData = {
      rows: new Map(), // url -> row object
      idCounter: 0
    };

    const self = this;
    this.pool = {
      async query(sql, params = []) {
        return self._handleStubQuery(sql, params);
      },
      async end() {
        self._stubData = null;
      }
    };
  }

  /**
   * Handle queries in stub mode with in-memory storage.
   * @private
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<{rows: Array, rowCount: number}>}
   */
  async _handleStubQuery(sql, params = []) {
    const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // CREATE TABLE / CREATE INDEX - no-op
    if (normalized.includes('create table') || normalized.includes('create index')) {
      return { rows: [], rowCount: 0 };
    }

    // INSERT
    if (normalized.includes('insert into')) {
      return this._stubInsert(params);
    }

    // UPDATE for dequeue (complex CTE with FOR UPDATE SKIP LOCKED)
    if (normalized.includes('update') && normalized.includes('status') && 
        (normalized.includes('in-progress') || normalized.includes("'in-progress'"))) {
      return this._stubDequeue(params);
    }

    // UPDATE for markComplete
    if (normalized.includes('update') && normalized.includes('completed')) {
      return this._stubUpdateStatus(params[0], 'completed');
    }

    // UPDATE for markFailed
    if (normalized.includes('update') && normalized.includes('failed')) {
      return this._stubUpdateStatus(params[0], 'failed', params[1]);
    }

    // UPDATE for returnToPending
    if (normalized.includes('update') && normalized.includes('pending') && 
        normalized.includes('worker_id = null')) {
      return this._stubReturnToPending(params[0]);
    }

    // UPDATE for updatePriority
    if (normalized.includes('update') && normalized.includes('priority =')) {
      return this._stubUpdatePriority(params);
    }

    // UPDATE for recoverStale
    if (normalized.includes('update') && normalized.includes('interval')) {
      return this._stubRecoverStale(params[0]);
    }

    // SELECT for stats
    if (normalized.includes('select') && normalized.includes('count(*)')) {
      return this._stubGetStats();
    }

    // SELECT for has/get single URL
    if (normalized.includes('select') && normalized.includes('where url =')) {
      return this._stubGetByUrl(params[0]);
    }

    // SELECT for getPending
    if (normalized.includes('select') && normalized.includes("status = 'pending'")) {
      return this._stubGetPending(normalized, params);
    }

    // DELETE for clear
    if (normalized.includes('delete from')) {
      this._stubData.rows.clear();
      return { rows: [], rowCount: 0 };
    }

    // Default: return empty
    return { rows: [], rowCount: 0 };
  }

  /**
   * Stub INSERT handling.
   * Detects insert type by checking if it's a batch (5 params per row) or single (6 params with meta).
   * @private
   */
  _stubInsert(params) {
    let inserted = 0;
    const insertedRows = [];

    // Detect if this is a single enqueue (6 params: url, domain, priority, depth, parentUrl, meta)
    // or a batch enqueueBatch (5 params per row: url, domain, priority, depth, parentUrl)
    // Single enqueue has meta as 6th param; batch doesn't include meta
    const isSingleWithMeta = params.length === 6;
    const chunkSize = isSingleWithMeta ? 6 : 5;

    for (let i = 0; i < params.length; i += chunkSize) {
      const url = params[i];
      // Skip if url is null/undefined (shouldn't happen, but defensive)
      if (!url || typeof url !== 'string') continue;
      
      const domain = params[i + 1];
      const priority = params[i + 2];
      const depth = params[i + 3];
      const parentUrl = params[i + 4];
      const meta = isSingleWithMeta ? params[i + 5] : null;

      if (!this._stubData.rows.has(url)) {
        const id = ++this._stubData.idCounter;
        const now = new Date().toISOString();
        const row = {
          id,
          url,
          domain,
          priority: priority || 0,
          depth: depth || 0,
          status: 'pending',
          parent_url: parentUrl,
          retry_count: 0,
          worker_id: null,
          error_message: null,
          meta: meta ? JSON.parse(meta) : null,
          created_at: now,
          updated_at: now
        };
        this._stubData.rows.set(url, row);
        inserted++;
        insertedRows.push({ id });
      }
    }

    return { rows: insertedRows, rowCount: inserted };
  }

  /**
   * Stub dequeue handling.
   * @private
   */
  _stubDequeue(params) {
    // Find the first pending URL ordered by priority DESC, created_at ASC
    const pendingRows = Array.from(this._stubData.rows.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return new Date(a.created_at) - new Date(b.created_at);
      });

    if (pendingRows.length === 0) {
      return { rows: [], rowCount: 0 };
    }

    const row = pendingRows[0];
    row.status = 'in-progress';
    row.worker_id = params[params.length - 1] || 'default'; // workerId is last param
    row.updated_at = new Date().toISOString();

    return { rows: [row], rowCount: 1 };
  }

  /**
   * Stub update status handling.
   * @private
   */
  _stubUpdateStatus(url, status, errorMessage = null) {
    const row = this._stubData.rows.get(url);
    if (row) {
      row.status = status;
      row.updated_at = new Date().toISOString();
      if (status === 'failed') {
        row.retry_count = (row.retry_count || 0) + 1;
        row.error_message = errorMessage;
      }
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  /**
   * Stub return to pending handling.
   * @private
   */
  _stubReturnToPending(url) {
    const row = this._stubData.rows.get(url);
    if (row) {
      row.status = 'pending';
      row.worker_id = null;
      row.updated_at = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  /**
   * Stub update priority handling.
   * @private
   */
  _stubUpdatePriority(params) {
    const priority = params[0];
    const url = params[1];
    const row = this._stubData.rows.get(url);
    if (row) {
      row.priority = priority;
      row.updated_at = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  /**
   * Stub recover stale handling.
   * @private
   */
  _stubRecoverStale(timeoutMs) {
    const cutoff = Date.now() - timeoutMs;
    let recovered = 0;

    for (const row of this._stubData.rows.values()) {
      if (row.status === 'in-progress') {
        const updatedTime = new Date(row.updated_at).getTime();
        if (updatedTime < cutoff) {
          row.status = 'pending';
          row.worker_id = null;
          row.updated_at = new Date().toISOString();
          recovered++;
        }
      }
    }

    return { rows: [], rowCount: recovered };
  }

  /**
   * Stub get stats handling.
   * @private
   */
  _stubGetStats() {
    const counts = { pending: 0, in_progress: 0, completed: 0, failed: 0, total: 0 };
    
    for (const row of this._stubData.rows.values()) {
      counts.total++;
      if (row.status === 'pending') counts.pending++;
      else if (row.status === 'in-progress') counts.in_progress++;
      else if (row.status === 'completed') counts.completed++;
      else if (row.status === 'failed') counts.failed++;
    }

    return { rows: [counts], rowCount: 1 };
  }

  /**
   * Stub get by URL handling.
   * @private
   */
  _stubGetByUrl(url) {
    const row = this._stubData.rows.get(url);
    if (row) {
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  /**
   * Stub get pending handling.
   * @private
   */
  _stubGetPending(sql, params) {
    let rows = Array.from(this._stubData.rows.values())
      .filter(r => r.status === 'pending');

    // Filter by domain if present
    if (sql.includes('domain =')) {
      const domain = params[0];
      rows = rows.filter(r => r.domain === domain);
    }

    // Sort by priority DESC, created_at ASC
    rows.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.created_at) - new Date(b.created_at);
    });

    // Apply limit
    if (sql.includes('limit')) {
      const limitMatch = sql.match(/limit\s+\$(\d+)/);
      if (limitMatch) {
        const paramIndex = parseInt(limitMatch[1], 10) - 1;
        const limit = params[paramIndex];
        rows = rows.slice(0, limit);
      }
    }

    return { rows, rowCount: rows.length };
  }

  /**
   * Create the queue table and indexes.
   * @private
   */
  async _createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        depth INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        parent_url TEXT,
        retry_count INTEGER DEFAULT 0,
        worker_id TEXT,
        error_message TEXT,
        meta JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status_priority 
        ON ${this.tableName} (status, priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_domain 
        ON ${this.tableName} (domain);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_worker 
        ON ${this.tableName} (worker_id) WHERE status = 'in-progress';
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated
        ON ${this.tableName} (updated_at) WHERE status = 'in-progress';
    `;
    await this.pool.query(sql);
  }

  /**
   * Convert a database row to a QueuedUrl object.
   * @private
   * @param {Object} row - Database row
   * @returns {import('./IUrlQueue').QueuedUrl}
   */
  _rowToQueuedUrl(row) {
    if (!row) return null;
    return {
      url: row.url,
      domain: row.domain,
      priority: row.priority,
      depth: row.depth,
      status: row.status,
      parentUrl: row.parent_url,
      retryCount: row.retry_count,
      workerId: row.worker_id,
      errorMessage: row.error_message,
      meta: row.meta || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Extract domain from URL.
   * @private
   * @param {string} url
   * @returns {string}
   */
  _extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * @param {import('./IUrlQueue').QueuedUrl} item
   * @returns {Promise<import('./IUrlQueue').EnqueueResult>}
   */
  async enqueue(item) {
    this._ensureInitialized();
    
    const sql = `
      INSERT INTO ${this.tableName} (url, domain, priority, depth, parent_url, status, meta)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      ON CONFLICT (url) DO NOTHING
      RETURNING id
    `;
    const result = await this.pool.query(sql, [
      item.url,
      item.domain || this._extractDomain(item.url),
      item.priority || 0,
      item.depth || 0,
      item.parentUrl || null,
      item.meta ? JSON.stringify(item.meta) : null
    ]);
    
    return {
      inserted: result.rowCount > 0,
      id: result.rows[0]?.id
    };
  }

  /**
   * @param {import('./IUrlQueue').QueuedUrl[]} items
   * @returns {Promise<import('./IUrlQueue').BatchEnqueueResult>}
   */
  async enqueueBatch(items) {
    this._ensureInitialized();
    if (items.length === 0) return { inserted: 0, skipped: 0 };

    // Build multi-row INSERT
    const values = [];
    const params = [];
    items.forEach((item, i) => {
      const offset = i * 5;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      params.push(
        item.url,
        item.domain || this._extractDomain(item.url),
        item.priority || 0,
        item.depth || 0,
        item.parentUrl || null
      );
    });

    const sql = `
      INSERT INTO ${this.tableName} (url, domain, priority, depth, parent_url)
      VALUES ${values.join(', ')}
      ON CONFLICT (url) DO NOTHING
    `;
    const result = await this.pool.query(sql, params);
    
    return {
      inserted: result.rowCount,
      skipped: items.length - result.rowCount
    };
  }

  /**
   * @param {import('./IUrlQueue').DequeueOptions} [options]
   * @returns {Promise<import('./IUrlQueue').QueuedUrl|null>}
   */
  async dequeue(options = {}) {
    this._ensureInitialized();

    // Atomic dequeue using FOR UPDATE SKIP LOCKED
    // This ensures multiple workers don't grab the same URL
    let whereClause = `status = 'pending'`;
    const params = [];

    if (options.domain) {
      params.push(options.domain);
      whereClause += ` AND domain = $${params.length}`;
    }

    if (options.maxRetries !== undefined) {
      params.push(options.maxRetries);
      whereClause += ` AND retry_count < $${params.length}`;
    }

    params.push(options.workerId || 'default');
    const workerIdParam = `$${params.length}`;

    const sql = `
      UPDATE ${this.tableName}
      SET status = 'in-progress', 
          worker_id = ${workerIdParam},
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM ${this.tableName}
        WHERE ${whereClause}
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
    
    const result = await this.pool.query(sql, params);
    if (result.rows.length === 0) return null;
    
    return this._rowToQueuedUrl(result.rows[0]);
  }

  /**
   * @param {string} url
   * @param {Object} [result]
   * @returns {Promise<void>}
   */
  async markComplete(url, result = {}) {
    this._ensureInitialized();
    
    const sql = `
      UPDATE ${this.tableName}
      SET status = 'completed', updated_at = NOW()
      WHERE url = $1
    `;
    await this.pool.query(sql, [url]);
  }

  /**
   * @param {string} url
   * @param {Object} [error]
   * @returns {Promise<void>}
   */
  async markFailed(url, error = {}) {
    this._ensureInitialized();
    
    const sql = `
      UPDATE ${this.tableName}
      SET status = 'failed', 
          error_message = $2,
          retry_count = retry_count + 1,
          updated_at = NOW()
      WHERE url = $1
    `;
    await this.pool.query(sql, [url, error.message || 'Unknown error']);
  }

  /**
   * @param {string} url
   * @returns {Promise<void>}
   */
  async returnToPending(url) {
    this._ensureInitialized();
    
    const sql = `
      UPDATE ${this.tableName}
      SET status = 'pending', worker_id = NULL, updated_at = NOW()
      WHERE url = $1
    `;
    await this.pool.query(sql, [url]);
  }

  /**
   * @param {import('./IUrlQueue').GetPendingOptions} [options]
   * @returns {Promise<import('./IUrlQueue').QueuedUrl[]>}
   */
  async getPending(options = {}) {
    this._ensureInitialized();

    let sql = `
      SELECT id, url, domain, priority, depth, status, parent_url, retry_count,
             worker_id, error_message, meta, created_at, updated_at
      FROM ${this.tableName}
      WHERE status = 'pending'
    `;
    const params = [];

    if (options.domain) {
      params.push(options.domain);
      sql += ` AND domain = $${params.length}`;
    }

    // Order by
    const orderBy = options.orderBy || 'priority';
    if (orderBy === 'priority') {
      sql += ` ORDER BY priority DESC, created_at ASC`;
    } else if (orderBy === 'created_at') {
      sql += ` ORDER BY created_at ASC`;
    } else if (orderBy === 'depth') {
      sql += ` ORDER BY depth ASC, priority DESC`;
    }

    if (options.limit) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }

    if (options.offset) {
      params.push(options.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await this.pool.query(sql, params);
    return result.rows.map(row => this._rowToQueuedUrl(row));
  }

  /**
   * @returns {Promise<import('./IUrlQueue').QueueStats>}
   */
  async getStats() {
    this._ensureInitialized();
    
    const sql = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM ${this.tableName}
    `;
    const result = await this.pool.query(sql);
    const row = result.rows[0] || {};
    
    return {
      pending: parseInt(row.pending || 0, 10),
      inProgress: parseInt(row.in_progress || 0, 10),
      completed: parseInt(row.completed || 0, 10),
      failed: parseInt(row.failed || 0, 10),
      total: parseInt(row.total || 0, 10)
    };
  }

  /**
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async has(url) {
    this._ensureInitialized();
    
    const sql = `SELECT 1 FROM ${this.tableName} WHERE url = $1 LIMIT 1`;
    const result = await this.pool.query(sql, [url]);
    return result.rows.length > 0;
  }

  /**
   * @param {string} url
   * @returns {Promise<import('./IUrlQueue').QueuedUrl|null>}
   */
  async get(url) {
    this._ensureInitialized();
    
    const sql = `
      SELECT id, url, domain, priority, depth, status, parent_url, retry_count,
             worker_id, error_message, meta, created_at, updated_at
      FROM ${this.tableName}
      WHERE url = $1
    `;
    const result = await this.pool.query(sql, [url]);
    return this._rowToQueuedUrl(result.rows[0]);
  }

  /**
   * @param {string} url
   * @param {number} priority
   * @returns {Promise<boolean>}
   */
  async updatePriority(url, priority) {
    this._ensureInitialized();
    
    const sql = `
      UPDATE ${this.tableName}
      SET priority = $1, updated_at = NOW()
      WHERE url = $2
    `;
    const result = await this.pool.query(sql, [priority, url]);
    return result.rowCount > 0;
  }

  /**
   * @param {number} timeoutMs
   * @returns {Promise<number>}
   */
  async recoverStale(timeoutMs) {
    this._ensureInitialized();
    
    const sql = `
      UPDATE ${this.tableName}
      SET status = 'pending', worker_id = NULL, updated_at = NOW()
      WHERE status = 'in-progress' 
        AND updated_at < NOW() - INTERVAL '${timeoutMs} milliseconds'
    `;
    const result = await this.pool.query(sql, [timeoutMs]);
    return result.rowCount;
  }

  /**
   * @returns {Promise<void>}
   */
  async clear() {
    this._ensureInitialized();
    await this.pool.query(`DELETE FROM ${this.tableName}`);
  }

  /**
   * @returns {Promise<void>}
   */
  async close() {
    if (this._ownsPool && this.pool && this.pool.end) {
      await this.pool.end();
      this.pool = null;
    }
    this._initialized = false;
  }

  /**
   * Ensure the adapter is initialized before operations.
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('PostgresUrlQueueAdapter not initialized. Call initialize() first.');
    }
  }
}

module.exports = { PostgresUrlQueueAdapter };
