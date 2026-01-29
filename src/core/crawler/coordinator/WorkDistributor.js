'use strict';

/**
 * WorkDistributor — Assigns domains/URLs to workers based on strategy
 * 
 * Strategies:
 * - 'round-robin': Cycle through available domains evenly
 * - 'least-loaded': Prefer domains with fewer in-progress URLs
 * - 'affinity': Prefer domains the worker has crawled before (cache locality)
 * - 'priority': Pick highest-priority URLs first regardless of domain
 * 
 * @module src/crawler/coordinator/WorkDistributor
 */
class WorkDistributor {
  /**
   * @param {Object} options
   * @param {'round-robin'|'least-loaded'|'affinity'|'priority'} [options.strategy='round-robin']
   * @param {Object} [options.registry] - WorkerRegistry instance
   * @param {Object} [options.lockManager] - DomainLockManager instance
   * @param {Object} [options.queue] - IUrlQueue implementation
   * @param {Object} [options.logger=console]
   */
  constructor({ 
    strategy = 'round-robin', 
    registry = null, 
    lockManager = null, 
    queue = null, 
    logger = console 
  } = {}) {
    this.strategy = strategy;
    this.registry = registry;
    this.lockManager = lockManager;
    this.queue = queue;
    this.logger = logger;
    
    // Round-robin state
    this._roundRobinIndex = 0;
    
    // Worker load tracking: workerId -> count of in-progress URLs
    this._workerLoads = new Map();
    
    // Worker affinity tracking: workerId -> Map<domain, crawlCount>
    this._workerAffinity = new Map();
    
    // Domain load tracking: domain -> count of in-progress URLs
    this._domainLoads = new Map();
    
    // Stats
    this._stats = {
      totalAssignments: 0,
      lockConflicts: 0,
      emptyQueues: 0
    };
  }

  /**
   * Get next work assignment for a worker
   * @param {string} workerId
   * @param {Object} [options]
   * @param {string} [options.preferDomain] - Prefer URLs from this domain
   * @param {number} [options.maxRetries=3] - Max retries for lock acquisition
   * @returns {Promise<{url: string, domain: string, priority: number, depth: number}|null>}
   */
  async getNextWork(workerId, options = {}) {
    if (!this.queue) {
      throw new Error('Queue not configured');
    }
    
    const maxRetries = options.maxRetries || 3;
    let retries = 0;
    
    while (retries < maxRetries) {
      // Get pending URLs
      const pendingUrls = await this.queue.getPending({ limit: 100 });
      
      if (pendingUrls.length === 0) {
        this._stats.emptyQueues++;
        return null;
      }
      
      // Extract unique domains
      const domains = [...new Set(pendingUrls.map(u => u.domain))];
      
      // Filter to available domains (not locked by others)
      let availableDomains = domains;
      if (this.lockManager) {
        availableDomains = await this.lockManager.getAvailableDomains(domains, workerId);
      }
      
      if (availableDomains.length === 0) {
        this._stats.lockConflicts++;
        retries++;
        continue;
      }
      
      // Apply preference if specified - use preferred domain directly if available
      let domain;
      if (options.preferDomain && availableDomains.includes(options.preferDomain)) {
        domain = options.preferDomain;
      } else {
        // Pick a domain based on strategy
        domain = this._selectDomain(availableDomains, workerId, pendingUrls);
      }
      
      // Try to acquire lock
      if (this.lockManager) {
        const { acquired, reason } = await this.lockManager.acquire(domain, workerId);
        if (!acquired) {
          this.logger.debug?.(`[WorkDistributor] Lock not acquired for ${domain}: ${reason}`);
          this._stats.lockConflicts++;
          retries++;
          continue;
        }
      }
      
      // Dequeue a URL from that domain
      const item = await this.queue.dequeue({ domain, workerId });
      
      if (!item) {
        // No URLs available for this domain, release lock and try another
        if (this.lockManager) {
          await this.lockManager.release(domain, workerId);
        }
        retries++;
        continue;
      }
      
      // Track load and affinity
      this._incrementLoad(workerId, domain);
      this._recordAffinity(workerId, domain);
      this._stats.totalAssignments++;
      
      return item;
    }
    
    // Exhausted retries
    return null;
  }

  /**
   * Report work completed (for load tracking and lock release)
   * @param {string} workerId
   * @param {string} domain
   * @param {Object} [result] - Crawl result metadata
   * @returns {Promise<void>}
   */
  async workComplete(workerId, domain, result = {}) {
    this._decrementLoad(workerId, domain);
    
    if (this.lockManager) {
      await this.lockManager.release(domain, workerId);
    }
  }

  /**
   * Report work failed (for load tracking and potential retry)
   * @param {string} workerId
   * @param {string} domain
   * @param {Object} [error]
   * @returns {Promise<void>}
   */
  async workFailed(workerId, domain, error = {}) {
    this._decrementLoad(workerId, domain);
    
    if (this.lockManager) {
      await this.lockManager.release(domain, workerId);
    }
  }

  /**
   * Get domains currently assigned to a worker
   * @param {string} workerId
   * @returns {Promise<string[]>}
   */
  async getWorkerDomains(workerId) {
    if (this.lockManager) {
      return this.lockManager.getWorkerLocks(workerId);
    }
    return [];
  }

  /**
   * Get current load for a worker
   * @param {string} workerId
   * @returns {number}
   */
  getWorkerLoad(workerId) {
    return this._workerLoads.get(workerId) || 0;
  }

  /**
   * Get current load for a domain
   * @param {string} domain
   * @returns {number}
   */
  getDomainLoad(domain) {
    return this._domainLoads.get(domain) || 0;
  }

  /**
   * Get distribution statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      strategy: this.strategy,
      workerLoads: Object.fromEntries(this._workerLoads),
      domainLoads: Object.fromEntries(this._domainLoads)
    };
  }

  /**
   * Set distribution strategy
   * @param {'round-robin'|'least-loaded'|'affinity'|'priority'} strategy
   */
  setStrategy(strategy) {
    const validStrategies = ['round-robin', 'least-loaded', 'affinity', 'priority'];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}. Must be one of: ${validStrategies.join(', ')}`);
    }
    this.strategy = strategy;
    this.logger.info(`[WorkDistributor] Strategy changed to: ${strategy}`);
  }

  /**
   * Select domain based on strategy
   * @private
   */
  _selectDomain(domains, workerId, pendingUrls) {
    if (domains.length === 1) {
      return domains[0];
    }
    
    switch (this.strategy) {
      case 'round-robin':
        return this._selectRoundRobin(domains);
        
      case 'least-loaded':
        return this._selectLeastLoaded(domains);
        
      case 'affinity':
        return this._selectByAffinity(domains, workerId);
        
      case 'priority':
        return this._selectByPriority(domains, pendingUrls);
        
      default:
        return domains[0];
    }
  }

  /**
   * Round-robin domain selection
   * @private
   */
  _selectRoundRobin(domains) {
    this._roundRobinIndex = (this._roundRobinIndex + 1) % domains.length;
    return domains[this._roundRobinIndex];
  }

  /**
   * Select domain with least in-progress URLs
   * @private
   */
  _selectLeastLoaded(domains) {
    let minLoad = Infinity;
    let selected = domains[0];
    
    for (const domain of domains) {
      const load = this._domainLoads.get(domain) || 0;
      if (load < minLoad) {
        minLoad = load;
        selected = domain;
      }
    }
    
    return selected;
  }

  /**
   * Select domain based on worker affinity (prefer domains worker has crawled before)
   * @private
   */
  _selectByAffinity(domains, workerId) {
    const affinity = this._workerAffinity.get(workerId);
    if (!affinity) {
      return domains[0];
    }
    
    let maxAffinity = 0;
    let selected = domains[0];
    
    for (const domain of domains) {
      const score = affinity.get(domain) || 0;
      if (score > maxAffinity) {
        maxAffinity = score;
        selected = domain;
      }
    }
    
    return selected;
  }

  /**
   * Select domain with highest-priority pending URL
   * @private
   */
  _selectByPriority(domains, pendingUrls) {
    const domainPriorities = new Map();
    
    for (const url of pendingUrls) {
      const current = domainPriorities.get(url.domain) || 0;
      if (url.priority > current) {
        domainPriorities.set(url.domain, url.priority);
      }
    }
    
    let maxPriority = -Infinity;
    let selected = domains[0];
    
    for (const domain of domains) {
      const priority = domainPriorities.get(domain) || 0;
      if (priority > maxPriority) {
        maxPriority = priority;
        selected = domain;
      }
    }
    
    return selected;
  }

  /**
   * Increment load counters
   * @private
   */
  _incrementLoad(workerId, domain) {
    this._workerLoads.set(workerId, (this._workerLoads.get(workerId) || 0) + 1);
    this._domainLoads.set(domain, (this._domainLoads.get(domain) || 0) + 1);
  }

  /**
   * Decrement load counters
   * @private
   */
  _decrementLoad(workerId, domain) {
    const workerLoad = this._workerLoads.get(workerId) || 0;
    this._workerLoads.set(workerId, Math.max(0, workerLoad - 1));
    
    const domainLoad = this._domainLoads.get(domain) || 0;
    this._domainLoads.set(domain, Math.max(0, domainLoad - 1));
  }

  /**
   * Record worker-domain affinity
   * @private
   */
  _recordAffinity(workerId, domain) {
    if (!this._workerAffinity.has(workerId)) {
      this._workerAffinity.set(workerId, new Map());
    }
    const affinity = this._workerAffinity.get(workerId);
    affinity.set(domain, (affinity.get(domain) || 0) + 1);
  }

  /**
   * Clear worker state (for worker shutdown)
   * @param {string} workerId
   */
  clearWorker(workerId) {
    this._workerLoads.delete(workerId);
    this._workerAffinity.delete(workerId);
  }

  /**
   * Reset all state
   */
  reset() {
    this._roundRobinIndex = 0;
    this._workerLoads.clear();
    this._workerAffinity.clear();
    this._domainLoads.clear();
    this._stats = {
      totalAssignments: 0,
      lockConflicts: 0,
      emptyQueues: 0
    };
  }
}

module.exports = { WorkDistributor };
