'use strict';

/**
 * Crawler Coordinator Module
 * 
 * Provides multi-worker coordination for distributed crawling:
 * - WorkerRegistry: Track and manage crawler workers
 * - DomainLockManager: Prevent concurrent crawling of same domain
 * - WorkDistributor: Assign work to workers based on strategy
 * 
 * @module src/crawler/coordinator
 * 
 * @example
 * const { WorkerRegistry, DomainLockManager, WorkDistributor } = require('./coordinator');
 * 
 * // Create coordinator components
 * const registry = new WorkerRegistry({ staleTimeoutMs: 30000 });
 * const lockManager = new DomainLockManager({ lockTimeoutMs: 60000 });
 * const distributor = new WorkDistributor({ 
 *   strategy: 'least-loaded',
 *   registry,
 *   lockManager,
 *   queue
 * });
 * 
 * // Initialize
 * await registry.initialize();
 * 
 * // Worker lifecycle
 * await registry.register({ id: 'worker-1' });
 * 
 * // Get work
 * const work = await distributor.getNextWork('worker-1');
 * if (work) {
 *   // Crawl the URL...
 *   await distributor.workComplete('worker-1', work.domain);
 * }
 * 
 * // Shutdown
 * await registry.deregister('worker-1');
 * await registry.close();
 */

const { WorkerRegistry } = require('./WorkerRegistry');
const { DomainLockManager } = require('./DomainLockManager');
const { WorkDistributor } = require('./WorkDistributor');

module.exports = {
  WorkerRegistry,
  DomainLockManager,
  WorkDistributor
};
