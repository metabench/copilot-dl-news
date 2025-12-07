'use strict';

const EventEmitter = require('events');

/**
 * ResourceBudget - Explicit tracking and enforcement of resource limits.
 *
 * Provides a unified way to:
 * - Define resource limits (pages, bytes, time, errors, memory)
 * - Track spending against those limits
 * - Enforce limits with callbacks and exceptions
 * - Reserve resources before consuming them
 * - Handle budget exhaustion gracefully
 *
 * Design principles:
 * - Proactive checking (can we afford this?) vs reactive (did we exceed?)
 * - Observable exhaustion events
 * - Reservation pattern for atomic operations
 * - Composable (child budgets, allocated portions)
 *
 * @example
 * const budget = new ResourceBudget({
 *   limits: {
 *     pages: 1000,
 *     bytes: 100 * 1024 * 1024, // 100 MB
 *     time: 3600000,            // 1 hour
 *     errors: 50
 *   }
 * });
 *
 * budget.onExhausted('pages', () => console.log('Page budget exhausted!'));
 *
 * // Check before spending
 * if (budget.canAfford('pages', 1)) {
 *   await fetchPage();
 *   budget.spend('pages', 1);
 * }
 *
 * @extends EventEmitter
 */
class ResourceBudget extends EventEmitter {
  /**
   * Resource type constants.
   */
  static RESOURCES = Object.freeze({
    PAGES: 'pages',
    BYTES: 'bytes',
    TIME: 'time',
    ERRORS: 'errors',
    MEMORY: 'memory',
    REQUESTS: 'requests',
    RETRIES: 'retries'
  });

  /**
   * Default limits for presets.
   */
  static PRESETS = Object.freeze({
    default: {
      pages: 1000,
      bytes: 100 * 1024 * 1024,
      time: 600000,
      errors: 100
    },
    light: {
      pages: 100,
      bytes: 10 * 1024 * 1024,
      time: 60000,
      errors: 20
    },
    heavy: {
      pages: 10000,
      bytes: 1024 * 1024 * 1024,
      time: 24 * 3600000,
      errors: 500
    },
    unlimited: {
      pages: Infinity,
      bytes: Infinity,
      time: Infinity,
      errors: Infinity,
      memory: Infinity,
      requests: Infinity,
      retries: Infinity
    }
  });

  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.limits - Resource limits { pages, bytes, time, errors, ... }
   * @param {number} options.warningThreshold - Threshold for warning (default 0.8 = 80%)
   * @param {string} options.enforcement - 'warn', 'error', or 'silent'
   */
  constructor(options = {}) {
    super();

    const limits = options.limits || {};

    // Normalize limits - default to Infinity for undefined
    this._limits = {
      pages: limits.pages ?? Infinity,
      bytes: limits.bytes ?? Infinity,
      time: limits.time ?? Infinity,
      errors: limits.errors ?? Infinity,
      memory: limits.memory ?? Infinity,
      requests: limits.requests ?? Infinity,
      retries: limits.retries ?? Infinity
    };

    // Track spending
    this._spent = {
      pages: 0,
      bytes: 0,
      time: 0,
      errors: 0,
      memory: 0,
      requests: 0,
      retries: 0
    };

    // Reserved amounts (not yet spent but committed)
    this._reserved = {
      pages: 0,
      bytes: 0,
      time: 0,
      errors: 0,
      memory: 0,
      requests: 0,
      retries: 0
    };

    // Configuration
    this._warningThreshold = options.warningThreshold ?? 0.8;
    this._enforcement = options.enforcement ?? 'warn';

    // State tracking
    this._warningsEmitted = new Set();
    this._exhaustedEmitted = new Set();

    // Callbacks
    this._exhaustedCallbacks = new Map();
    this._warningCallbacks = new Map();

    // Parent budget (for child budgets)
    this._parent = null;
    this._parentReservations = new Map();
  }

  // ============================================================
  // LIMITS
  // ============================================================

  /**
   * Get limit for a resource.
   */
  getLimit(resource) {
    return this._limits[resource] ?? Infinity;
  }

  /**
   * Check if a resource is unlimited.
   */
  isUnlimited(resource) {
    return this._limits[resource] === Infinity;
  }

  /**
   * Check if a limit is defined (not Infinity).
   */
  hasLimit(resource) {
    return this._limits[resource] !== Infinity;
  }

  // ============================================================
  // SPENDING
  // ============================================================

  /**
   * Spend a resource.
   * @param {string} resource - Resource type
   * @param {number} amount - Amount to spend (can be negative for refunds)
   * @returns {number} Remaining amount after spending
   */
  spend(resource, amount = 1) {
    const wasExhausted = this.isExhausted(resource);

    // Check enforcement before spending
    if (this._enforcement === 'error' && !this.canAfford(resource, amount)) {
      throw new BudgetExhaustedError(resource, amount, this.getRemaining(resource));
    }

    // Apply spending
    this._spent[resource] = (this._spent[resource] || 0) + amount;

    // Emit spend event
    this.emit('spend', resource, amount, this.getRemaining(resource));

    // Check for warning threshold
    this._checkWarning(resource);

    // Check for exhaustion after spending (if not already exhausted)
    if (!wasExhausted && this.isExhausted(resource)) {
      this._handleExhaustion(resource);
    }

    return this.getRemaining(resource);
  }

  /**
   * Get spent amount for a resource.
   */
  getSpent(resource) {
    return this._spent[resource] || 0;
  }

  // ============================================================
  // REMAINING
  // ============================================================

  /**
   * Get remaining budget for a resource.
   */
  getRemaining(resource) {
    const limit = this._limits[resource];
    if (limit === Infinity) return Infinity;

    const spent = this._spent[resource] || 0;
    const reserved = this._reserved[resource] || 0;
    return limit - spent - reserved;
  }

  /**
   * Get reserved amount for a resource.
   */
  getReserved(resource) {
    return this._reserved[resource] || 0;
  }

  /**
   * Get remaining as percentage (0-100).
   */
  getPercentRemaining(resource) {
    const limit = this._limits[resource];
    if (limit === Infinity) return 100;
    if (limit === 0) return 0;
    return Math.max(0, (this.getRemaining(resource) / limit) * 100);
  }

  /**
   * Get used as percentage (0-100).
   */
  getPercentUsed(resource) {
    return 100 - this.getPercentRemaining(resource);
  }

  // ============================================================
  // AFFORDABILITY
  // ============================================================

  /**
   * Check if we can afford to spend an amount.
   */
  canAfford(resource, amount = 1) {
    return this.getRemaining(resource) >= amount;
  }

  /**
   * Check if we can afford multiple resources at once.
   * @param {Object} costs - { resource: amount, ... }
   */
  canAffordAll(costs) {
    for (const [resource, amount] of Object.entries(costs)) {
      if (!this.canAfford(resource, amount)) {
        return false;
      }
    }
    return true;
  }

  // ============================================================
  // RESERVATION
  // ============================================================

  /**
   * Reserve resources for a future operation.
   * Returns a reservation object with commit() and release() methods.
   *
   * @param {string} resource - Resource type
   * @param {number} amount - Amount to reserve
   * @returns {{ commit: Function, release: Function, resource: string, amount: number } | null}
   */
  reserve(resource, amount = 1) {
    if (!this.canAfford(resource, amount)) {
      return null;
    }

    // Add to reserved
    this._reserved[resource] = (this._reserved[resource] || 0) + amount;

    const reservation = {
      resource,
      amount,
      committed: false,
      released: false,

      commit: () => {
        if (reservation.committed || reservation.released) return false;
        reservation.committed = true;

        // Move from reserved to spent
        this._reserved[resource] -= amount;
        this._spent[resource] = (this._spent[resource] || 0) + amount;

        // Check exhaustion
        if (this.isExhausted(resource)) {
          this._handleExhaustion(resource);
        }

        this.emit('reservation:committed', { resource, amount });
        return true;
      },

      release: () => {
        if (reservation.committed || reservation.released) return false;
        reservation.released = true;

        // Return to available
        this._reserved[resource] -= amount;

        this.emit('reservation:released', { resource, amount });
        return true;
      }
    };

    this.emit('reservation:created', { resource, amount });
    return reservation;
  }

  // ============================================================
  // WARNING & EXHAUSTION
  // ============================================================

  /**
   * Check if a resource is at warning level.
   */
  isWarning(resource) {
    const limit = this._limits[resource];
    if (limit === Infinity) return false;

    const percentUsed = this.getPercentUsed(resource);
    return percentUsed >= this._warningThreshold * 100;
  }

  /**
   * Check if a resource is exhausted (remaining <= 0).
   */
  isExhausted(resource) {
    const limit = this._limits[resource];
    if (limit === Infinity) return false;

    return this.getRemaining(resource) <= 0;
  }

  /**
   * Check if any resource is exhausted.
   */
  anyExhausted() {
    for (const resource of Object.keys(this._limits)) {
      if (this.isExhausted(resource)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all exhausted resources.
   */
  getExhaustedResources() {
    return Object.keys(this._limits).filter(r => this.isExhausted(r));
  }

  /**
   * Register callback for when a resource is exhausted.
   */
  onExhausted(resource, callback) {
    if (!this._exhaustedCallbacks.has(resource)) {
      this._exhaustedCallbacks.set(resource, []);
    }
    this._exhaustedCallbacks.get(resource).push(callback);
    return this;
  }

  /**
   * Register callback for when a resource hits warning threshold.
   */
  onWarning(resource, callback) {
    if (!this._warningCallbacks.has(resource)) {
      this._warningCallbacks.set(resource, []);
    }
    this._warningCallbacks.get(resource).push(callback);
    return this;
  }

  /**
   * Handle resource exhaustion.
   * @private
   */
  _handleExhaustion(resource) {
    if (this._exhaustedEmitted.has(resource)) return;
    this._exhaustedEmitted.add(resource);

    const callbacks = this._exhaustedCallbacks.get(resource) || [];
    for (const cb of callbacks) {
      try {
        cb(this.getSpent(resource), this._limits[resource]);
      } catch (e) {
        console.error('Budget exhausted callback error:', e);
      }
    }

    this.emit('exhausted', resource, this.getSpent(resource), this._limits[resource]);
  }

  /**
   * Check and emit warning if threshold crossed.
   * @private
   */
  _checkWarning(resource) {
    if (this._warningsEmitted.has(resource)) return;
    if (!this.isWarning(resource)) return;

    this._warningsEmitted.add(resource);

    const callbacks = this._warningCallbacks.get(resource) || [];
    for (const cb of callbacks) {
      try {
        cb(this.getRemaining(resource), this._limits[resource]);
      } catch (e) {
        console.error('Budget warning callback error:', e);
      }
    }

    this.emit('warning', resource, this.getRemaining(resource), this._limits[resource]);
  }

  // ============================================================
  // CHILD BUDGETS
  // ============================================================

  /**
   * Create a child budget with allocated limits.
   * The allocation is reserved from the parent until the child is committed or released.
   *
   * @param {Object} allocation - Limits for child budget { resource: amount }
   * @returns {ResourceBudget}
   */
  allocate(allocation) {
    // Reserve resources from parent
    const reservations = new Map();
    for (const [resource, amount] of Object.entries(allocation)) {
      const reservation = this.reserve(resource, amount);
      if (!reservation) {
        // Release any already-made reservations
        for (const [, res] of reservations) {
          res.release();
        }
        return null;
      }
      reservations.set(resource, reservation);
    }

    // Create child with the allocated limits
    const child = new ResourceBudget({ limits: allocation });
    child._parent = this;
    child._parentReservations = reservations;

    return child;
  }

  /**
   * Commit child budget spending to parent.
   */
  commit() {
    if (!this._parent) return;

    // Commit parent reservations with actual spending
    for (const [resource, reservation] of this._parentReservations) {
      // Release the full reservation
      reservation.release();
      // Spend what was actually used
      this._parent.spend(resource, this.getSpent(resource));
    }

    this._parentReservations.clear();
  }

  /**
   * Release child budget, returning unspent allocation to parent.
   */
  release() {
    if (!this._parent) return;

    // Release parent reservations
    for (const [resource, reservation] of this._parentReservations) {
      // Release the reservation
      reservation.release();
      // Still spend what was actually used
      if (this.getSpent(resource) > 0) {
        this._parent.spend(resource, this.getSpent(resource));
      }
    }

    this._parentReservations.clear();
  }

  // ============================================================
  // RESET
  // ============================================================

  /**
   * Reset all spending and reservations.
   */
  reset() {
    for (const resource of Object.keys(this._spent)) {
      this._spent[resource] = 0;
    }
    for (const resource of Object.keys(this._reserved)) {
      this._reserved[resource] = 0;
    }
    this._warningsEmitted.clear();
    this._exhaustedEmitted.clear();

    this.emit('reset');
  }

  // ============================================================
  // SERIALIZATION
  // ============================================================

  /**
   * Serialize to JSON.
   */
  toJSON() {
    const result = {};

    for (const resource of Object.keys(this._limits)) {
      if (this._limits[resource] !== Infinity) {
        result[resource] = {
          limit: this._limits[resource],
          spent: this.getSpent(resource),
          reserved: this.getReserved(resource),
          remaining: this.getRemaining(resource),
          percentUsed: this.getPercentUsed(resource),
          isExhausted: this.isExhausted(resource),
          isWarning: this.isWarning(resource)
        };
      }
    }

    return result;
  }

  /**
   * Get summary string.
   */
  get summary() {
    const parts = [];

    for (const resource of Object.keys(this._limits)) {
      if (this._limits[resource] !== Infinity) {
        const spent = this.getSpent(resource);
        const limit = this._limits[resource];
        parts.push(`${resource}: ${spent}/${limit}`);
      }
    }

    return parts.join(', ') || 'No limits set';
  }

  // ============================================================
  // STATIC FACTORY METHODS
  // ============================================================

  /**
   * Create with preset limits.
   */
  static preset(name) {
    const presetLimits = ResourceBudget.PRESETS[name] || ResourceBudget.PRESETS.default;
    return new ResourceBudget({ limits: { ...presetLimits } });
  }

  /**
   * Create from config object.
   */
  static fromConfig(config) {
    return new ResourceBudget({
      limits: {
        pages: config.maxPages,
        bytes: config.maxBytes,
        time: config.maxTimeMs || config.timeout,
        errors: config.maxErrors
      }
    });
  }
}

/**
 * Error thrown when budget is exhausted in 'error' mode.
 */
class BudgetExhaustedError extends Error {
  constructor(resource, requested, available) {
    super(`Budget exhausted for ${resource}: requested ${requested}, available ${available}`);
    this.name = 'BudgetExhaustedError';
    this.resource = resource;
    this.requested = requested;
    this.available = available;
  }
}

module.exports = ResourceBudget;
module.exports.BudgetExhaustedError = BudgetExhaustedError;
