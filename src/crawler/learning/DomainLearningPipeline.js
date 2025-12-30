'use strict';

/**
 * DomainLearningPipeline - Main orchestration for domain learning
 * 
 * Coordinates template generation, testing, and review for a domain.
 * Auto-approves high-confidence templates, queues others for review.
 * 
 * @module DomainLearningPipeline
 * @example
 * const pipeline = new DomainLearningPipeline({ db, logger: console });
 * const result = await pipeline.learnDomain('example.com', { samples });
 * if (result.autoApproved) {
 *   console.log('Template ready for use');
 * }
 */

const { EventEmitter } = require('events');
const { TemplateGenerator } = require('./TemplateGenerator');
const { TemplateTester } = require('./TemplateTester');
const { ReviewQueue, ReviewStatus } = require('./ReviewQueue');

/**
 * @typedef {Object} LearningResult
 * @property {boolean} success - Whether learning succeeded
 * @property {string} domain - Domain that was learned
 * @property {Object} template - Generated template
 * @property {number} accuracy - Test accuracy (0-1)
 * @property {boolean} autoApproved - Whether template was auto-approved
 * @property {number} [queueId] - Queue ID if queued for review
 * @property {string} status - 'approved', 'queued', or 'failed'
 * @property {Object} [errors] - Any errors that occurred
 */

/**
 * Default accuracy threshold for auto-approval (90%)
 */
const DEFAULT_AUTO_APPROVE_THRESHOLD = 0.9;

/**
 * Minimum samples required for learning
 */
const MIN_SAMPLES = 1;

class DomainLearningPipeline extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {Object} [opts.db] - Database instance
   * @param {Object} [opts.logger] - Logger instance
   * @param {Object} [opts.generator] - Custom TemplateGenerator
   * @param {Object} [opts.tester] - Custom TemplateTester
   * @param {Object} [opts.reviewQueue] - Custom ReviewQueue
   * @param {number} [opts.autoApproveThreshold=0.9] - Accuracy threshold for auto-approval
   * @param {Object} [opts.templateAdapter] - Template storage adapter
   */
  constructor(opts = {}) {
    super();
    
    this.db = opts.db || null;
    this.logger = opts.logger || console;
    this.autoApproveThreshold = opts.autoApproveThreshold ?? DEFAULT_AUTO_APPROVE_THRESHOLD;
    this.templateAdapter = opts.templateAdapter || null;
    
    // Initialize components
    this.generator = opts.generator || new TemplateGenerator({ logger: this.logger });
    this.tester = opts.tester || new TemplateTester({ logger: this.logger });
    this.reviewQueue = opts.reviewQueue || new ReviewQueue({
      db: this.db,
      adapter: opts.reviewAdapter,
      logger: this.logger
    });
    
    // Statistics
    this._stats = {
      domainsLearned: 0,
      autoApproved: 0,
      queuedForReview: 0,
      failed: 0
    };
  }

  /**
   * Learn a domain from sample pages
   * 
   * @param {string} domain - Domain to learn
   * @param {Object} opts - Learning options
   * @param {Object[]} opts.samples - Sample pages for learning
   * @param {boolean} [opts.forceQueue=false] - Force queue even if high accuracy
   * @param {boolean} [opts.skipTest=false] - Skip testing phase
   * @returns {Promise<LearningResult>}
   */
  async learnDomain(domain, opts = {}) {
    if (!domain) {
      throw new Error('learnDomain requires domain');
    }

    const samples = opts.samples || [];
    if (samples.length < MIN_SAMPLES) {
      return {
        success: false,
        domain,
        template: null,
        accuracy: 0,
        autoApproved: false,
        status: 'failed',
        errors: { samples: `Need at least ${MIN_SAMPLES} sample(s), got ${samples.length}` }
      };
    }

    this.logger.info?.(`[DomainLearningPipeline] Starting learning for ${domain} with ${samples.length} samples`);
    this.emit('learning:start', { domain, sampleCount: samples.length });

    let template;
    try {
      // Step 1: Generate template
      template = this.generator.generate(samples, { domain });
      this.emit('learning:generated', { domain, template });
    } catch (err) {
      this.logger.error?.(`[DomainLearningPipeline] Template generation failed: ${err.message}`);
      this._stats.failed++;
      return {
        success: false,
        domain,
        template: null,
        accuracy: 0,
        autoApproved: false,
        status: 'failed',
        errors: { generation: err.message }
      };
    }

    // Step 2: Test template
    let accuracy = template.confidence;
    let testResult = null;
    
    if (!opts.skipTest) {
      testResult = this.tester.test(template, samples);
      accuracy = testResult.accuracy;
      template.testedAccuracy = accuracy;
      this.emit('learning:tested', { domain, accuracy, testResult });
    }

    this._stats.domainsLearned++;

    // Step 3: Decide approval path
    const shouldAutoApprove = !opts.forceQueue && accuracy >= this.autoApproveThreshold;

    if (shouldAutoApprove) {
      // Auto-approve high confidence templates
      this._stats.autoApproved++;
      
      // Store the approved template
      if (this.templateAdapter) {
        await this.templateAdapter.save(domain, template);
      }

      const result = {
        success: true,
        domain,
        template,
        accuracy,
        autoApproved: true,
        status: 'approved'
      };

      this.logger.info?.(`[DomainLearningPipeline] Auto-approved template for ${domain} (accuracy=${(accuracy * 100).toFixed(1)}%)`);
      this.emit('learning:approved', result);
      this.emit('learning:complete', result);

      return result;
    } else {
      // Queue for human review
      this._stats.queuedForReview++;
      
      const queueItem = this.reviewQueue.add(domain, template, accuracy, {
        sampleCount: samples.length
      });

      const result = {
        success: true,
        domain,
        template,
        accuracy,
        autoApproved: false,
        queueId: queueItem.id,
        status: 'queued'
      };

      this.logger.info?.(`[DomainLearningPipeline] Queued template for ${domain} for review (accuracy=${(accuracy * 100).toFixed(1)}%)`);
      this.emit('learning:queued', result);
      this.emit('learning:complete', result);

      return result;
    }
  }

  /**
   * Get pending reviews
   * 
   * @param {number} [limit=10] - Maximum items to return
   * @returns {Object[]} Pending review items
   */
  getReviewQueue(limit = 10) {
    return this.reviewQueue.getPending(limit);
  }

  /**
   * Approve a template from the review queue
   * 
   * @param {number} id - Queue item ID
   * @param {Object} [opts] - Options
   * @param {string} [opts.reviewedBy] - Reviewer identifier
   * @returns {Promise<Object>} Approval result
   */
  async approveTemplate(id, opts = {}) {
    const item = this.reviewQueue.approve(id, opts);
    
    // Store the approved template
    if (this.templateAdapter && item.template) {
      await this.templateAdapter.save(item.domain, item.template);
    }

    this.logger.info?.(`[DomainLearningPipeline] Approved template ${id} for ${item.domain}`);
    this.emit('template:approved', { id, domain: item.domain, template: item.template });

    return item;
  }

  /**
   * Reject a template from the review queue
   * 
   * @param {number} id - Queue item ID
   * @param {string} reason - Rejection reason
   * @param {Object} [opts] - Options
   * @param {string} [opts.reviewedBy] - Reviewer identifier
   * @returns {Object} Rejection result
   */
  rejectTemplate(id, reason, opts = {}) {
    const item = this.reviewQueue.reject(id, reason, opts);
    
    this.logger.info?.(`[DomainLearningPipeline] Rejected template ${id} for ${item.domain}: ${reason}`);
    this.emit('template:rejected', { id, domain: item.domain, reason });

    return item;
  }

  /**
   * Get an approved template for a domain
   * 
   * @param {string} domain - Domain to get template for
   * @returns {Promise<Object|null>} Template or null
   */
  async getTemplate(domain) {
    // Try template adapter first
    if (this.templateAdapter) {
      const template = await this.templateAdapter.get(domain);
      if (template) return template;
    }

    // Fall back to review queue approved templates
    return this.reviewQueue.getApprovedTemplate(domain);
  }

  /**
   * Check if a domain has an approved template
   * 
   * @param {string} domain - Domain to check
   * @returns {Promise<boolean>}
   */
  async hasTemplate(domain) {
    const template = await this.getTemplate(domain);
    return !!template;
  }

  /**
   * Re-learn a domain (update existing template)
   * 
   * @param {string} domain - Domain to re-learn
   * @param {Object} opts - Learning options
   * @returns {Promise<LearningResult>}
   */
  async relearnDomain(domain, opts = {}) {
    this.logger.info?.(`[DomainLearningPipeline] Re-learning ${domain}`);
    this.emit('learning:relearn', { domain });
    
    return this.learnDomain(domain, { ...opts, forceQueue: true });
  }

  /**
   * Get pipeline statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    const queueStats = this.reviewQueue.getStats();
    
    return {
      domainsLearned: this._stats.domainsLearned,
      autoApproved: this._stats.autoApproved,
      queuedForReview: this._stats.queuedForReview,
      failed: this._stats.failed,
      autoApprovalRate: this._stats.domainsLearned > 0
        ? this._stats.autoApproved / this._stats.domainsLearned
        : 0,
      queue: queueStats
    };
  }

  /**
   * Get review item by ID
   * 
   * @param {number} id - Queue item ID
   * @returns {Object|null}
   */
  getReviewItem(id) {
    return this.reviewQueue.getById(id);
  }

  /**
   * Get reviews for a specific domain
   * 
   * @param {string} domain - Domain to filter by
   * @param {Object} [opts] - Options
   * @returns {Object[]}
   */
  getReviewsByDomain(domain, opts = {}) {
    return this.reviewQueue.getByDomain(domain, opts);
  }

  /**
   * Set auto-approve threshold
   * 
   * @param {number} threshold - New threshold (0-1)
   */
  setAutoApproveThreshold(threshold) {
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.autoApproveThreshold = threshold;
    this.logger.info?.(`[DomainLearningPipeline] Auto-approve threshold set to ${(threshold * 100).toFixed(0)}%`);
  }

  /**
   * Clear all data (for testing)
   */
  clear() {
    this.reviewQueue.clear();
    this._stats = {
      domainsLearned: 0,
      autoApproved: 0,
      queuedForReview: 0,
      failed: 0
    };
  }
}

module.exports = {
  DomainLearningPipeline,
  DEFAULT_AUTO_APPROVE_THRESHOLD,
  MIN_SAMPLES
};
