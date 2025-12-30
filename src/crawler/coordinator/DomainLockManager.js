'use strict';

/**
 * DomainLockManager — Ensures only one worker crawls a domain at a time
 * 
 * Prevents rate limit violations when running multiple workers.
 * Supports both in-memory (single process) and distributed (DB-backed) modes.
 * 
 * Lock lifecycle:
 * 1. Worker calls acquire(domain, workerId) before crawling
 * 2. If acquired, worker crawls the domain
 * 3. Worker calls extend() periodically if crawling takes longer than lock timeout
 * 4. Worker calls release() when done (or lock expires automatically)
 * 
 * @module src/crawler/coordinator/DomainLockManager
 */
class DomainLockManager {
  /**
   * @param {Object} options
   * @param {number} [options.lockTimeoutMs=60000] - Default lock duration
   * @param {number} [options.maxLocksPerWorker=5] - Maximum domains a worker can lock
   * @param {Object} [options.logger=console] - Logger instance
   */
  constructor({ 
    lockTimeoutMs = 60000, 
    maxLocksPerWorker = 5,
    logger = console 
  } = {}) {
    this.lockTimeoutMs = lockTimeoutMs;
    this.maxLocksPerWorker = maxLocksPerWorker;
    this.logger = logger;
    
    // domain -> { workerId, acquiredAt, expiresAt, renewCount }
    this._locks = new Map();
    
    // workerId -> Set<domain>
    this._workerLocks = new Map();
  }

  /**
   * Acquire a lock on a domain
   * @param {string} domain - Domain to lock (e.g., 'example.com')
   * @param {string} workerId - Worker requesting the lock
   * @param {Object} [options]
   * @param {number} [options.timeoutMs] - Custom timeout for this lock
   * @returns {Promise<{acquired: boolean, holder?: string, expiresIn?: number, reason?: string}>}
   */
  async acquire(domain, workerId, options = {}) {
    if (!domain || !workerId) {
      return { acquired: false, reason: 'Domain and workerId are required' };
    }
    
    const now = Date.now();
    const timeoutMs = options.timeoutMs || this.lockTimeoutMs;
    
    // Clean up expired lock if present
    const existing = this._locks.get(domain);
    if (existing && existing.expiresAt <= now) {
      this._removeLock(domain);
    }
    
    // Check if lock is held by another worker
    const current = this._locks.get(domain);
    if (current && current.workerId !== workerId) {
      return {
        acquired: false,
        holder: current.workerId,
        expiresIn: current.expiresAt - now,
        reason: 'Domain locked by another worker'
      };
    }
    
    // Check worker's lock count
    const workerLocks = this._workerLocks.get(workerId) || new Set();
    if (workerLocks.size >= this.maxLocksPerWorker && !workerLocks.has(domain)) {
      return {
        acquired: false,
        reason: `Worker has reached max locks (${this.maxLocksPerWorker})`
      };
    }
    
    // Acquire or renew lock
    const lock = {
      workerId,
      acquiredAt: current?.acquiredAt || now,
      expiresAt: now + timeoutMs,
      renewCount: current ? (current.renewCount || 0) + 1 : 0
    };
    
    this._locks.set(domain, lock);
    
    // Track worker's locks
    if (!this._workerLocks.has(workerId)) {
      this._workerLocks.set(workerId, new Set());
    }
    this._workerLocks.get(workerId).add(domain);
    
    this.logger.debug?.(`[DomainLockManager] Lock acquired: ${domain} by ${workerId} (expires in ${timeoutMs}ms)`);
    
    return { acquired: true };
  }

  /**
   * Release a lock on a domain
   * @param {string} domain
   * @param {string} workerId
   * @returns {Promise<{released: boolean, reason?: string}>}
   */
  async release(domain, workerId) {
    const existing = this._locks.get(domain);
    
    if (!existing) {
      return { released: true, reason: 'Lock did not exist' };
    }
    
    if (existing.workerId !== workerId) {
      return { released: false, reason: 'Not lock holder' };
    }
    
    this._removeLock(domain);
    this.logger.debug?.(`[DomainLockManager] Lock released: ${domain} by ${workerId}`);
    
    return { released: true };
  }

  /**
   * Extend a lock (renew while crawling)
   * @param {string} domain
   * @param {string} workerId
   * @param {number} [extensionMs] - Extension duration (defaults to lockTimeoutMs)
   * @returns {Promise<{extended: boolean, expiresAt?: number, reason?: string}>}
   */
  async extend(domain, workerId, extensionMs = null) {
    const existing = this._locks.get(domain);
    
    if (!existing) {
      return { extended: false, reason: 'Lock does not exist' };
    }
    
    if (existing.workerId !== workerId) {
      return { extended: false, reason: 'Not lock holder' };
    }
    
    const now = Date.now();
    
    // Check if lock has expired
    if (existing.expiresAt <= now) {
      this._removeLock(domain);
      return { extended: false, reason: 'Lock has expired' };
    }
    
    existing.expiresAt = now + (extensionMs || this.lockTimeoutMs);
    existing.renewCount = (existing.renewCount || 0) + 1;
    
    return { extended: true, expiresAt: existing.expiresAt };
  }

  /**
   * Get all currently held locks
   * @returns {Promise<Array<{domain: string, workerId: string, acquiredAt: number, expiresAt: number}>>}
   */
  async getLocks() {
    const now = Date.now();
    const locks = [];
    
    for (const [domain, lock] of this._locks) {
      if (lock.expiresAt > now) {
        locks.push({ domain, ...lock });
      }
    }
    
    return locks;
  }

  /**
   * Get locks held by a specific worker
   * @param {string} workerId
   * @returns {Promise<string[]>} - List of domains locked by this worker
   */
  async getWorkerLocks(workerId) {
    const locks = this._workerLocks.get(workerId) || new Set();
    const now = Date.now();
    const valid = [];
    
    for (const domain of locks) {
      const lock = this._locks.get(domain);
      if (lock && lock.expiresAt > now && lock.workerId === workerId) {
        valid.push(domain);
      }
    }
    
    return valid;
  }

  /**
   * Filter domains to those not locked (or locked by this worker)
   * @param {string[]} domains
   * @param {string} [workerId] - If provided, includes domains locked by this worker
   * @returns {Promise<string[]>}
   */
  async getAvailableDomains(domains, workerId = null) {
    const now = Date.now();
    
    return domains.filter(d => {
      const lock = this._locks.get(d);
      if (!lock || lock.expiresAt <= now) {
        return true; // Not locked or expired
      }
      if (workerId && lock.workerId === workerId) {
        return true; // Locked by requesting worker
      }
      return false;
    });
  }

  /**
   * Check if a domain is currently locked
   * @param {string} domain
   * @returns {Promise<{locked: boolean, holder?: string, expiresIn?: number}>}
   */
  async isLocked(domain) {
    const lock = this._locks.get(domain);
    const now = Date.now();
    
    if (!lock || lock.expiresAt <= now) {
      return { locked: false };
    }
    
    return {
      locked: true,
      holder: lock.workerId,
      expiresIn: lock.expiresAt - now
    };
  }

  /**
   * Release all locks held by a worker (for worker shutdown/crash)
   * @param {string} workerId
   * @returns {Promise<{released: number}>}
   */
  async releaseAll(workerId) {
    const workerLocks = this._workerLocks.get(workerId) || new Set();
    let released = 0;
    
    for (const domain of workerLocks) {
      const lock = this._locks.get(domain);
      if (lock && lock.workerId === workerId) {
        this._locks.delete(domain);
        released++;
      }
    }
    
    this._workerLocks.delete(workerId);
    
    if (released > 0) {
      this.logger.info(`[DomainLockManager] Released ${released} locks for worker ${workerId}`);
    }
    
    return { released };
  }

  /**
   * Clean up expired locks
   * @returns {Promise<{cleaned: number}>}
   */
  async cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [domain, lock] of this._locks) {
      if (lock.expiresAt <= now) {
        this._removeLock(domain);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug?.(`[DomainLockManager] Cleaned up ${cleaned} expired locks`);
    }
    
    return { cleaned };
  }

  /**
   * Get lock statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    const workerCounts = new Map();
    
    for (const [domain, lock] of this._locks) {
      if (lock.expiresAt > now) {
        active++;
        const count = workerCounts.get(lock.workerId) || 0;
        workerCounts.set(lock.workerId, count + 1);
      } else {
        expired++;
      }
    }
    
    return {
      active,
      expired,
      total: this._locks.size,
      workerCount: workerCounts.size,
      locksPerWorker: Object.fromEntries(workerCounts)
    };
  }

  /**
   * Internal: Remove lock and update worker tracking
   * @private
   */
  _removeLock(domain) {
    const lock = this._locks.get(domain);
    if (lock) {
      const workerLocks = this._workerLocks.get(lock.workerId);
      if (workerLocks) {
        workerLocks.delete(domain);
        if (workerLocks.size === 0) {
          this._workerLocks.delete(lock.workerId);
        }
      }
      this._locks.delete(domain);
    }
  }

  /**
   * Clear all locks (for testing)
   * @returns {Promise<void>}
   */
  async clear() {
    this._locks.clear();
    this._workerLocks.clear();
  }
}

module.exports = { DomainLockManager };
