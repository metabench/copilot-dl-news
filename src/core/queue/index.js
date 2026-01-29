'use strict';

/**
 * src/queue — URL Queue Abstraction Layer
 * 
 * This module provides an abstracted URL queue system with adapters for
 * different backends (SQLite, Postgres). Enable switching via config.
 * 
 * @module src/queue
 * 
 * @example
 * // Basic usage with factory (recommended)
 * const { QueueFactory } = require('./queue');
 * const queue = await QueueFactory.create();
 * 
 * // Enqueue URLs
 * await queue.enqueue({ url: 'https://example.com', domain: 'example.com', priority: 100 });
 * 
 * // Dequeue for crawling
 * const next = await queue.dequeue({ workerId: 'worker-1' });
 * if (next) {
 *   try {
 *     await crawl(next.url);
 *     await queue.markComplete(next.url);
 *   } catch (err) {
 *     await queue.markFailed(next.url, { message: err.message });
 *   }
 * }
 * 
 * // Get stats
 * const stats = await queue.getStats();
 * console.log(`${stats.pending} pending, ${stats.inProgress} in progress`);
 * 
 * // Clean up
 * await queue.close();
 * 
 * @example
 * // Direct adapter usage (for testing)
 * const { SqliteUrlQueueAdapter } = require('./queue');
 * const queue = new SqliteUrlQueueAdapter({ dbPath: ':memory:' });
 * await queue.initialize();
 * // ... use queue ...
 * await queue.close();
 */

const { IUrlQueue } = require('./IUrlQueue');
const { SqliteUrlQueueAdapter } = require('./SqliteUrlQueueAdapter');
const { PostgresUrlQueueAdapter } = require('./PostgresUrlQueueAdapter');
const { QueueFactory } = require('./QueueFactory');

module.exports = {
  // Interface
  IUrlQueue,
  
  // Adapters
  SqliteUrlQueueAdapter,
  PostgresUrlQueueAdapter,
  
  // Factory
  QueueFactory
};
