'use strict';

/**
 * ReviewQueue - Human review queue for extraction templates
 * 
 * Manages a queue of templates that need human review before
 * being approved for production use. Supports approval, rejection,
 * and filtering by status.
 * 
 * @module ReviewQueue
 * @example
 * const queue = new ReviewQueue({ db });
 * queue.add('example.com', template, 0.85);
 * const pending = queue.getPending(10);
 * queue.approve(pending[0].id);
 */

/**
 * @typedef {Object} QueueItem
 * @property {number} id - Unique identifier
 * @property {string} domain - Domain this template is for
 * @property {Object} template - The extraction template
 * @property {number} accuracyScore - Accuracy score from testing (0-1)
 * @property {number} sampleCount - Number of samples used
 * @property {string} status - Status: 'pending', 'approved', 'rejected'
 * @property {string} [reviewedBy] - Who reviewed the template
 * @property {string} [reviewedAt] - When it was reviewed
 * @property {string} [rejectionReason] - Reason for rejection
 * @property {string} createdAt - When it was added to queue
 */

const ReviewStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

class ReviewQueue {
  /**
   * @param {Object} opts
   * @param {Object} [opts.db] - Database instance
   * @param {Object} [opts.adapter] - Template review adapter
   * @param {Object} [opts.logger] - Logger instance
   */
  constructor(opts = {}) {
    this.db = opts.db || null;
    this.adapter = opts.adapter || null;
    this.logger = opts.logger || console;
    
    // In-memory fallback when no DB
    this._memoryQueue = [];
    this._nextId = 1;
  }

  /**
   * Add a template to the review queue
   * 
   * @param {string} domain - Domain the template is for
   * @param {Object} template - The extraction template
   * @param {number} accuracy - Accuracy score (0-1)
   * @param {Object} [opts] - Additional options
   * @param {number} [opts.sampleCount] - Number of samples used
   * @returns {QueueItem} The created queue item
   */
  add(domain, template, accuracy, opts = {}) {
    if (!domain) {
      throw new Error('add requires domain');
    }
    if (!template) {
      throw new Error('add requires template');
    }
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 1) {
      throw new Error('add requires accuracy between 0 and 1');
    }

    const now = new Date().toISOString();
    const item = {
      id: null,
      domain,
      template,
      accuracyScore: accuracy,
      sampleCount: opts.sampleCount || template.sampleCount || 0,
      status: ReviewStatus.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: now
    };

    if (this.adapter) {
      const result = this.adapter.add(item);
      item.id = result.id;
    } else {
      // In-memory fallback
      item.id = this._nextId++;
      this._memoryQueue.push(item);
    }

    this.logger.info?.(`[ReviewQueue] Added template for ${domain} to review queue (id=${item.id}, accuracy=${(accuracy * 100).toFixed(1)}%)`);

    return item;
  }

  /**
   * Get pending review items
   * 
   * @param {number} [limit=10] - Maximum items to return
   * @returns {QueueItem[]} Pending queue items
   */
  getPending(limit = 10) {
    if (this.adapter) {
      return this.adapter.getPending(limit);
    }

    // In-memory fallback
    return this._memoryQueue
      .filter(item => item.status === ReviewStatus.PENDING)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Get a specific queue item by ID
   * 
   * @param {number} id - Queue item ID
   * @returns {QueueItem|null} Queue item or null
   */
  getById(id) {
    if (this.adapter) {
      return this.adapter.getById(id);
    }

    return this._memoryQueue.find(item => item.id === id) || null;
  }

  /**
   * Approve a template
   * 
   * @param {number} id - Queue item ID
   * @param {Object} [opts] - Options
   * @param {string} [opts.reviewedBy] - Reviewer identifier
   * @returns {QueueItem} Updated queue item
   */
  approve(id, opts = {}) {
    const item = this.getById(id);
    if (!item) {
      throw new Error(`Queue item ${id} not found`);
    }

    if (item.status !== ReviewStatus.PENDING) {
      throw new Error(`Queue item ${id} is not pending (status=${item.status})`);
    }

    const now = new Date().toISOString();
    const updates = {
      status: ReviewStatus.APPROVED,
      reviewedBy: opts.reviewedBy || 'system',
      reviewedAt: now
    };

    if (this.adapter) {
      this.adapter.updateStatus(id, updates);
    } else {
      Object.assign(item, updates);
    }

    this.logger.info?.(`[ReviewQueue] Approved template for ${item.domain} (id=${id})`);

    return { ...item, ...updates };
  }

  /**
   * Reject a template
   * 
   * @param {number} id - Queue item ID
   * @param {string} reason - Rejection reason
   * @param {Object} [opts] - Options
   * @param {string} [opts.reviewedBy] - Reviewer identifier
   * @returns {QueueItem} Updated queue item
   */
  reject(id, reason, opts = {}) {
    if (!reason) {
      throw new Error('reject requires a reason');
    }

    const item = this.getById(id);
    if (!item) {
      throw new Error(`Queue item ${id} not found`);
    }

    if (item.status !== ReviewStatus.PENDING) {
      throw new Error(`Queue item ${id} is not pending (status=${item.status})`);
    }

    const now = new Date().toISOString();
    const updates = {
      status: ReviewStatus.REJECTED,
      reviewedBy: opts.reviewedBy || 'system',
      reviewedAt: now,
      rejectionReason: reason
    };

    if (this.adapter) {
      this.adapter.updateStatus(id, updates);
    } else {
      Object.assign(item, updates);
    }

    this.logger.info?.(`[ReviewQueue] Rejected template for ${item.domain} (id=${id}, reason=${reason})`);

    return { ...item, ...updates };
  }

  /**
   * Get queue statistics
   * 
   * @returns {Object} Queue statistics
   */
  getStats() {
    if (this.adapter) {
      return this.adapter.getStats();
    }

    // In-memory fallback
    const pending = this._memoryQueue.filter(i => i.status === ReviewStatus.PENDING).length;
    const approved = this._memoryQueue.filter(i => i.status === ReviewStatus.APPROVED).length;
    const rejected = this._memoryQueue.filter(i => i.status === ReviewStatus.REJECTED).length;
    
    return {
      total: this._memoryQueue.length,
      pending,
      approved,
      rejected,
      approvalRate: (approved + rejected) > 0 ? approved / (approved + rejected) : 0
    };
  }

  /**
   * Get items by domain
   * 
   * @param {string} domain - Domain to filter by
   * @param {Object} [opts] - Options
   * @param {string} [opts.status] - Filter by status
   * @returns {QueueItem[]} Queue items
   */
  getByDomain(domain, opts = {}) {
    if (this.adapter) {
      return this.adapter.getByDomain(domain, opts);
    }

    // In-memory fallback
    return this._memoryQueue
      .filter(item => {
        if (item.domain !== domain) return false;
        if (opts.status && item.status !== opts.status) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get approved template for a domain
   * 
   * @param {string} domain - Domain to get template for
   * @returns {Object|null} Approved template or null
   */
  getApprovedTemplate(domain) {
    const items = this.getByDomain(domain, { status: ReviewStatus.APPROVED });
    if (items.length === 0) return null;
    
    // Return most recently approved
    return items[0].template;
  }

  /**
   * Clear all items (for testing)
   */
  clear() {
    if (this.adapter) {
      this.adapter.clear();
    }
    this._memoryQueue = [];
    this._nextId = 1;
  }

  /**
   * Get queue size
   * @returns {number}
   */
  get size() {
    if (this.adapter) {
      return this.adapter.count();
    }
    return this._memoryQueue.length;
  }

  /**
   * Get pending count
   * @returns {number}
   */
  get pendingCount() {
    if (this.adapter) {
      const stats = this.adapter.getStats();
      return stats.pending || 0;
    }
    return this._memoryQueue.filter(i => i.status === ReviewStatus.PENDING).length;
  }
}

module.exports = { ReviewQueue, ReviewStatus };
