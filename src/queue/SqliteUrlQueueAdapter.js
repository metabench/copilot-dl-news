'use strict';

const { IUrlQueue } = require('./IUrlQueue');

/**
 * SqliteUrlQueueAdapter — SQLite-backed URL queue for single-process crawling
 * 
 * Uses better-sqlite3 for synchronous operations wrapped in async interface
 * for compatibility with the IUrlQueue contract.
 * 
 * Features:
 * - Persistent queue survives process restarts
 * - Transactional batch operations
 * - Indexed for fast priority-based dequeue
 * - Compatible with existing news.db schema
 * 
 * @implements {IUrlQueue}
 */
class SqliteUrlQueueAdapter extends IUrlQueue {
  /**
   * @param {Object} options
   * @param {Object} [options.db] - better-sqlite3 database instance (injected for testing)
   * @param {string} [options.dbPath] - Path to SQLite database file
   * @param {string} [options.tableName] - Queue table name (default: 'crawl_queue')
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    this.db = options.db || null;
    this.dbPath = options.dbPath || 'data/news.db';
    this.tableName = options.tableName || 'crawl_queue';
    this.logger = options.logger || console;
    this._initialized = false;
    this._ownsDb = false; // Track if we created the db connection
    this._statements = null; // Prepared statements cache
  }

  /**
   * @returns {string}
   */
  get backendType() {
    return 'sqlite';
  }

  /**
   * Initialize the queue - create table and indexes if needed.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;

    // Create db connection if not injected
    if (!this.db) {
      const Database = require('better-sqlite3');
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this._ownsDb = true;
    }

    this._createTable();
    this._prepareStatements();
    this._initialized = true;
  }

  /**
   * Create the queue table and indexes.
   * @private
   */
  _createTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        depth INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        parent_url TEXT,
        retry_count INTEGER DEFAULT 0,
        worker_id TEXT,
        error_message TEXT,
        meta TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status_priority 
        ON ${this.tableName} (status, priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_domain 
        ON ${this.tableName} (domain);
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_worker 
        ON ${this.tableName} (worker_id) WHERE status = 'in-progress';
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated
        ON ${this.tableName} (updated_at) WHERE status = 'in-progress';
    `);
  }

  /**
   * Prepare commonly used statements for performance.
   * @private
   */
  _prepareStatements() {
    const t = this.tableName;
    
    this._statements = {
      enqueue: this.db.prepare(`
        INSERT INTO ${t} (url, domain, priority, depth, parent_url, status, meta)
        VALUES (@url, @domain, @priority, @depth, @parentUrl, 'pending', @meta)
        ON CONFLICT(url) DO NOTHING
      `),

      dequeueSelect: this.db.prepare(`
        SELECT id, url, domain, priority, depth, status, parent_url, retry_count, 
               worker_id, error_message, meta, created_at, updated_at
        FROM ${t}
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `),

      dequeueSelectByDomain: this.db.prepare(`
        SELECT id, url, domain, priority, depth, status, parent_url, retry_count,
               worker_id, error_message, meta, created_at, updated_at
        FROM ${t}
        WHERE status = 'pending' AND domain = @domain
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `),

      markInProgress: this.db.prepare(`
        UPDATE ${t}
        SET status = 'in-progress', worker_id = @workerId, updated_at = datetime('now')
        WHERE id = @id
      `),

      markComplete: this.db.prepare(`
        UPDATE ${t}
        SET status = 'completed', updated_at = datetime('now')
        WHERE url = @url
      `),

      markFailed: this.db.prepare(`
        UPDATE ${t}
        SET status = 'failed', error_message = @errorMessage, 
            retry_count = retry_count + 1, updated_at = datetime('now')
        WHERE url = @url
      `),

      returnToPending: this.db.prepare(`
        UPDATE ${t}
        SET status = 'pending', worker_id = NULL, updated_at = datetime('now')
        WHERE url = @url
      `),

      has: this.db.prepare(`
        SELECT 1 FROM ${t} WHERE url = @url LIMIT 1
      `),

      get: this.db.prepare(`
        SELECT id, url, domain, priority, depth, status, parent_url, retry_count,
               worker_id, error_message, meta, created_at, updated_at
        FROM ${t}
        WHERE url = @url
      `),

      updatePriority: this.db.prepare(`
        UPDATE ${t}
        SET priority = @priority, updated_at = datetime('now')
        WHERE url = @url
      `),

      clear: this.db.prepare(`DELETE FROM ${t}`),

      stats: this.db.prepare(`
        SELECT 
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          COUNT(*) as total
        FROM ${t}
      `),

      recoverStale: this.db.prepare(`
        UPDATE ${t}
        SET status = 'pending', worker_id = NULL, updated_at = datetime('now')
        WHERE status = 'in-progress' 
          AND datetime(updated_at, '+' || @timeoutSec || ' seconds') < datetime('now')
      `)
    };
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
      meta: row.meta ? JSON.parse(row.meta) : null,
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
    
    const result = this._statements.enqueue.run({
      url: item.url,
      domain: item.domain || this._extractDomain(item.url),
      priority: item.priority || 0,
      depth: item.depth || 0,
      parentUrl: item.parentUrl || null,
      meta: item.meta ? JSON.stringify(item.meta) : null
    });

    return {
      inserted: result.changes > 0,
      id: result.changes > 0 ? result.lastInsertRowid : undefined
    };
  }

  /**
   * @param {import('./IUrlQueue').QueuedUrl[]} items
   * @returns {Promise<import('./IUrlQueue').BatchEnqueueResult>}
   */
  async enqueueBatch(items) {
    this._ensureInitialized();
    if (items.length === 0) return { inserted: 0, skipped: 0 };

    let inserted = 0;
    
    const insertMany = this.db.transaction((urls) => {
      for (const item of urls) {
        const result = this._statements.enqueue.run({
          url: item.url,
          domain: item.domain || this._extractDomain(item.url),
          priority: item.priority || 0,
          depth: item.depth || 0,
          parentUrl: item.parentUrl || null,
          meta: item.meta ? JSON.stringify(item.meta) : null
        });
        if (result.changes > 0) inserted++;
      }
    });

    insertMany(items);

    return {
      inserted,
      skipped: items.length - inserted
    };
  }

  /**
   * @param {import('./IUrlQueue').DequeueOptions} [options]
   * @returns {Promise<import('./IUrlQueue').QueuedUrl|null>}
   */
  async dequeue(options = {}) {
    this._ensureInitialized();

    // SQLite is single-writer, so we use a transaction for atomicity
    const dequeueTransaction = this.db.transaction((opts) => {
      // Select the next URL
      let row;
      if (opts.domain) {
        row = this._statements.dequeueSelectByDomain.get({ domain: opts.domain });
      } else {
        row = this._statements.dequeueSelect.get();
      }

      if (!row) return null;

      // Check max retries if specified
      if (opts.maxRetries !== undefined && row.retry_count >= opts.maxRetries) {
        return null;
      }

      // Mark as in-progress
      this._statements.markInProgress.run({
        id: row.id,
        workerId: opts.workerId || 'default'
      });

      // Re-fetch to get updated status
      return this._statements.get.get({ url: row.url });
    });

    const row = dequeueTransaction(options);
    return this._rowToQueuedUrl(row);
  }

  /**
   * @param {string} url
   * @param {Object} [result]
   * @returns {Promise<void>}
   */
  async markComplete(url, result = {}) {
    this._ensureInitialized();
    this._statements.markComplete.run({ url });
  }

  /**
   * @param {string} url
   * @param {Object} [error]
   * @returns {Promise<void>}
   */
  async markFailed(url, error = {}) {
    this._ensureInitialized();
    this._statements.markFailed.run({
      url,
      errorMessage: error.message || 'Unknown error'
    });
  }

  /**
   * @param {string} url
   * @returns {Promise<void>}
   */
  async returnToPending(url) {
    this._ensureInitialized();
    this._statements.returnToPending.run({ url });
  }

  /**
   * @param {import('./IUrlQueue').GetPendingOptions} [options]
   * @returns {Promise<import('./IUrlQueue').QueuedUrl[]>}
   */
  async getPending(options = {}) {
    this._ensureInitialized();

    // Build dynamic query based on options
    let sql = `
      SELECT id, url, domain, priority, depth, status, parent_url, retry_count,
             worker_id, error_message, meta, created_at, updated_at
      FROM ${this.tableName}
      WHERE status = 'pending'
    `;
    const params = {};

    if (options.domain) {
      sql += ` AND domain = @domain`;
      params.domain = options.domain;
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
      sql += ` LIMIT @limit`;
      params.limit = options.limit;
    }

    if (options.offset) {
      sql += ` OFFSET @offset`;
      params.offset = options.offset;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params);
    return rows.map(row => this._rowToQueuedUrl(row));
  }

  /**
   * @returns {Promise<import('./IUrlQueue').QueueStats>}
   */
  async getStats() {
    this._ensureInitialized();
    const row = this._statements.stats.get();
    return {
      pending: row?.pending || 0,
      inProgress: row?.in_progress || 0,
      completed: row?.completed || 0,
      failed: row?.failed || 0,
      total: row?.total || 0
    };
  }

  /**
   * @param {string} url
   * @returns {Promise<boolean>}
   */
  async has(url) {
    this._ensureInitialized();
    const row = this._statements.has.get({ url });
    return !!row;
  }

  /**
   * @param {string} url
   * @returns {Promise<import('./IUrlQueue').QueuedUrl|null>}
   */
  async get(url) {
    this._ensureInitialized();
    const row = this._statements.get.get({ url });
    return this._rowToQueuedUrl(row);
  }

  /**
   * @param {string} url
   * @param {number} priority
   * @returns {Promise<boolean>}
   */
  async updatePriority(url, priority) {
    this._ensureInitialized();
    const result = this._statements.updatePriority.run({ url, priority });
    return result.changes > 0;
  }

  /**
   * @param {number} timeoutMs
   * @returns {Promise<number>}
   */
  async recoverStale(timeoutMs) {
    this._ensureInitialized();
    const timeoutSec = Math.floor(timeoutMs / 1000);
    const result = this._statements.recoverStale.run({ timeoutSec });
    return result.changes;
  }

  /**
   * @returns {Promise<void>}
   */
  async clear() {
    this._ensureInitialized();
    this._statements.clear.run();
  }

  /**
   * @returns {Promise<void>}
   */
  async close() {
    if (this._ownsDb && this.db) {
      this.db.close();
      this.db = null;
    }
    this._initialized = false;
    this._statements = null;
  }

  /**
   * Ensure the adapter is initialized before operations.
   * @private
   */
  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('SqliteUrlQueueAdapter not initialized. Call initialize() first.');
    }
  }
}

module.exports = { SqliteUrlQueueAdapter };
