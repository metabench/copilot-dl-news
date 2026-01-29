'use strict';

/**
 * IUrlQueue — Abstract interface for URL queue backends
 * 
 * All queue adapters must implement this interface.
 * Methods return Promises for async compatibility (Postgres, distributed systems).
 * 
 * Design rationale:
 * - Interface-first design enables backend swapping without changing callers
 * - All methods are async to support both sync (SQLite) and async (Postgres) backends
 * - Status enum matches crawler semantics: pending → in-progress → completed|failed
 * - Priority is a numeric score (higher = more important, but stored as negative for min-heap compat)
 * 
 * @module src/queue/IUrlQueue
 */

/**
 * @typedef {Object} QueuedUrl
 * @property {string} url - The URL to crawl
 * @property {string} domain - Domain extracted from URL (e.g., 'example.com')
 * @property {number} priority - Priority score (higher = more important)
 * @property {number} depth - Link depth from seed URL (0 = seed itself)
 * @property {string} status - 'pending' | 'in-progress' | 'completed' | 'failed'
 * @property {string} [parentUrl] - Referring/parent URL that discovered this URL
 * @property {number} [retryCount] - Number of retry attempts (default: 0)
 * @property {string} [workerId] - Worker/crawler instance that claimed this URL
 * @property {string} [errorMessage] - Error message if failed
 * @property {string} [createdAt] - ISO 8601 timestamp when URL was queued
 * @property {string} [updatedAt] - ISO 8601 timestamp of last status change
 * @property {Object} [meta] - Additional metadata (job ID, type, etc.)
 */

/**
 * @typedef {Object} QueueStats
 * @property {number} pending - URLs waiting to be crawled
 * @property {number} inProgress - URLs currently being crawled (claimed by workers)
 * @property {number} completed - Successfully crawled URLs
 * @property {number} failed - Failed URLs (after all retries exhausted)
 * @property {number} total - Total URLs in queue (sum of all statuses)
 */

/**
 * @typedef {Object} EnqueueResult
 * @property {boolean} inserted - Whether the URL was inserted (false if duplicate)
 * @property {number} [id] - Database ID of the inserted row (if available)
 */

/**
 * @typedef {Object} BatchEnqueueResult
 * @property {number} inserted - Number of URLs actually inserted
 * @property {number} skipped - Number of URLs skipped (duplicates)
 */

/**
 * @typedef {Object} DequeueOptions
 * @property {string} [domain] - Prefer URLs from this domain (domain-specific crawling)
 * @property {string} [workerId] - Worker ID claiming the URL (for crash recovery)
 * @property {number} [maxRetries] - Skip URLs that have exceeded this retry count
 */

/**
 * @typedef {Object} GetPendingOptions
 * @property {string} [domain] - Filter by domain
 * @property {number} [limit] - Maximum URLs to return
 * @property {number} [offset] - Offset for pagination
 * @property {string} [orderBy] - Order by field: 'priority' | 'created_at' | 'depth'
 */

/**
 * IUrlQueue — Abstract interface for URL queue backends
 * 
 * Implementors: SqliteUrlQueueAdapter, PostgresUrlQueueAdapter
 * 
 * @interface
 */
class IUrlQueue {
  /**
   * Initialize the queue (create tables, establish connections, etc.)
   * Must be called before any other operations.
   * Idempotent: safe to call multiple times.
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Not implemented: initialize()');
  }

  /**
   * Add a single URL to the queue.
   * If URL already exists, operation is a no-op (ON CONFLICT DO NOTHING).
   * 
   * @param {QueuedUrl} item - URL item to enqueue
   * @returns {Promise<EnqueueResult>}
   * 
   * @example
   * const result = await queue.enqueue({
   *   url: 'https://example.com/article/123',
   *   domain: 'example.com',
   *   priority: 100,
   *   depth: 1,
   *   parentUrl: 'https://example.com/'
   * });
   * console.log(result.inserted); // true or false
   */
  async enqueue(item) {
    throw new Error('Not implemented: enqueue()');
  }

  /**
   * Add multiple URLs to the queue in a single transaction.
   * More efficient than calling enqueue() in a loop.
   * Duplicates are silently skipped.
   * 
   * @param {QueuedUrl[]} items - Array of URL items to enqueue
   * @returns {Promise<BatchEnqueueResult>}
   * 
   * @example
   * const result = await queue.enqueueBatch([
   *   { url: 'https://example.com/a', domain: 'example.com', priority: 50, depth: 2 },
   *   { url: 'https://example.com/b', domain: 'example.com', priority: 75, depth: 2 }
   * ]);
   * console.log(`Inserted ${result.inserted}, skipped ${result.skipped}`);
   */
  async enqueueBatch(items) {
    throw new Error('Not implemented: enqueueBatch()');
  }

  /**
   * Atomically get the next URL to crawl and mark it as in-progress.
   * 
   * For distributed systems (Postgres), uses FOR UPDATE SKIP LOCKED
   * to prevent multiple workers from grabbing the same URL.
   * 
   * @param {DequeueOptions} [options] - Dequeue options
   * @returns {Promise<QueuedUrl|null>} - Next URL to crawl, or null if queue is empty
   * 
   * @example
   * const url = await queue.dequeue({ workerId: 'worker-1' });
   * if (url) {
   *   try {
   *     await crawl(url.url);
   *     await queue.markComplete(url.url);
   *   } catch (error) {
   *     await queue.markFailed(url.url, { message: error.message });
   *   }
   * }
   */
  async dequeue(options = {}) {
    throw new Error('Not implemented: dequeue()');
  }

  /**
   * Mark a URL as successfully completed.
   * 
   * @param {string} url - The URL to mark complete
   * @param {Object} [result] - Optional crawl result metadata
   * @param {number} [result.statusCode] - HTTP status code
   * @param {number} [result.contentLength] - Response content length
   * @param {number} [result.fetchTimeMs] - Time to fetch in milliseconds
   * @returns {Promise<void>}
   */
  async markComplete(url, result = {}) {
    throw new Error('Not implemented: markComplete()');
  }

  /**
   * Mark a URL as failed.
   * Increments retry count automatically.
   * 
   * @param {string} url - The URL to mark failed
   * @param {Object} [error] - Error details
   * @param {string} [error.message] - Error message
   * @param {string} [error.code] - Error code (e.g., 'ETIMEDOUT', 'ECONNREFUSED')
   * @param {number} [error.statusCode] - HTTP status code if applicable
   * @returns {Promise<void>}
   */
  async markFailed(url, error = {}) {
    throw new Error('Not implemented: markFailed()');
  }

  /**
   * Return an in-progress URL back to pending status.
   * Used for:
   * - Retry after transient failure
   * - Worker crash recovery
   * - Manual re-queue
   * 
   * @param {string} url - The URL to return to pending
   * @returns {Promise<void>}
   */
  async returnToPending(url) {
    throw new Error('Not implemented: returnToPending()');
  }

  /**
   * Get pending URLs, optionally filtered.
   * Does NOT mark them as in-progress (read-only query).
   * 
   * @param {GetPendingOptions} [options] - Query options
   * @returns {Promise<QueuedUrl[]>}
   */
  async getPending(options = {}) {
    throw new Error('Not implemented: getPending()');
  }

  /**
   * Get queue statistics (counts by status).
   * 
   * @returns {Promise<QueueStats>}
   * 
   * @example
   * const stats = await queue.getStats();
   * console.log(`Queue: ${stats.pending} pending, ${stats.inProgress} in-progress`);
   */
  async getStats() {
    throw new Error('Not implemented: getStats()');
  }

  /**
   * Check if a URL exists in the queue (any status).
   * 
   * @param {string} url - The URL to check
   * @returns {Promise<boolean>}
   */
  async has(url) {
    throw new Error('Not implemented: has()');
  }

  /**
   * Get a specific URL from the queue.
   * 
   * @param {string} url - The URL to get
   * @returns {Promise<QueuedUrl|null>}
   */
  async get(url) {
    throw new Error('Not implemented: get()');
  }

  /**
   * Update priority of a URL.
   * 
   * @param {string} url - The URL to update
   * @param {number} priority - New priority value
   * @returns {Promise<boolean>} - True if URL was found and updated
   */
  async updatePriority(url, priority) {
    throw new Error('Not implemented: updatePriority()');
  }

  /**
   * Recover stale in-progress URLs (worker crash recovery).
   * URLs that have been in-progress for longer than the timeout
   * are returned to pending status.
   * 
   * @param {number} timeoutMs - Consider URLs stale after this many milliseconds
   * @returns {Promise<number>} - Number of URLs recovered
   */
  async recoverStale(timeoutMs) {
    throw new Error('Not implemented: recoverStale()');
  }

  /**
   * Clear all URLs from the queue.
   * USE WITH CAUTION - primarily for testing.
   * 
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error('Not implemented: clear()');
  }

  /**
   * Close database connections and clean up resources.
   * Should be called when done with the queue.
   * 
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('Not implemented: close()');
  }

  /**
   * Get the backend type identifier.
   * 
   * @returns {string} - 'sqlite' | 'postgres' | 'memory' | etc.
   */
  get backendType() {
    throw new Error('Not implemented: backendType getter');
  }
}

// Status constants for consistency across adapters
IUrlQueue.STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

module.exports = { IUrlQueue };
