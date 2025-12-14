'use strict';

/**
 * Sequence Context Adapter
 * 
 * Provides optional integration with CrawlPlaybookService to enrich
 * sequence execution with domain-specific intelligence:
 * - Canonical start URLs
 * - Retry strategies
 * - Domain avoidance rules
 * - Learned crawl patterns
 */

const { CrawlPlaybookService } = require('../CrawlPlaybookService');
const { getDb } = require('../../db');

class SequenceContextAdapter {
  constructor({ playbookService, dbPath } = {}) {
    if (playbookService) {
      this._playbook = playbookService;
      this._ownedPlaybook = false;
    } else if (dbPath) {
      // Create our own playbook service instance
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      this._playbook = new CrawlPlaybookService({ db });
      this._ownedPlaybook = true;
    } else {
      // Try to use the shared database connection
      try {
        let db = getDb();
        if (db && typeof db.getHandle === 'function') {
          db = db.getHandle();
        }
        
        if (db) {
          this._playbook = new CrawlPlaybookService({ db });
          this._ownedPlaybook = false; // Shared connection, do not close
        } else {
          this._playbook = null;
          this._ownedPlaybook = false;
        }
      } catch (err) {
        this._playbook = null;
        this._ownedPlaybook = false;
      }
    }
  }

  /**
   * Check if playbook service is available
   */
  get hasPlaybook() {
    return Boolean(this._playbook);
  }

  /**
   * Resolve canonical start URL for a domain
   * Falls back to https://{domain} if no playbook entry exists
   */
  async resolveStartUrl(domain) {
    if (!this._playbook) {
      return `https://${domain}`;
    }

    try {
      const playbook = await this._playbook.loadPlaybook(domain);
      
      // Check if playbook has learned a preferred start URL
      // (This would be stored in patterns or hub tree)
      if (playbook.hubTree && playbook.hubTree.levels && playbook.hubTree.levels.length > 0) {
        const topLevel = playbook.hubTree.levels[0];
        if (topLevel.hubs && topLevel.hubs.length > 0) {
          return topLevel.hubs[0].url;
        }
      }

      // Default to https version of domain
      return `https://${domain}`;
    } catch (error) {
      return `https://${domain}`;
    }
  }

  /**
   * Get retry strategy for a domain
   */
  async getRetryStrategy(domain, url = null, failureKind = 'timeout') {
    if (!this._playbook) {
      return this._defaultRetryStrategy();
    }

    try {
      const strategy = this._playbook.getRetryStrategy(
        domain,
        url || `https://${domain}`,
        failureKind
      );
      return strategy || this._defaultRetryStrategy();
    } catch (error) {
      return this._defaultRetryStrategy();
    }
  }

  /**
   * Check if a URL should be avoided based on learned patterns
   */
  async shouldAvoidUrl(domain, url) {
    if (!this._playbook) {
      return false;
    }

    try {
      return await this._playbook.shouldAvoidUrl(domain, url);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get comprehensive playbook hints for a domain
   * Returns null if no playbook available or no data for domain
   */
  async getPlaybookHints(domain) {
    if (!this._playbook) {
      return null;
    }

    try {
      const playbook = await this._playbook.loadPlaybook(domain);
      const retryStrategy = this._playbook.getRetryStrategy(domain, `https://${domain}`, 'default');

      return {
        hubTreeLevels: playbook.hubTree?.levels?.length || 0,
        learnedPatterns: playbook.patterns?.length || 0,
        avoidanceRules: playbook.avoidanceRules?.length || 0,
        retryStrategy: {
          maxAttempts: retryStrategy.maxAttempts,
          backoffMs: retryStrategy.backoffMs,
          strategy: retryStrategy.strategy
        },
        hasIntelligence: playbook.patterns?.length > 0 || playbook.hubTree?.levels?.length > 0
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Suggest sequence preset based on playbook state
   * Returns preset name or null if no recommendation
   */
  async suggestSequencePreset(domain) {
    if (!this._playbook) {
      return null;
    }

    try {
      const playbook = await this._playbook.loadPlaybook(domain);
      
      // If hub tree is empty, start with structure ensure
      if (!playbook.hubTree || !playbook.hubTree.levels || playbook.hubTree.levels.length === 0) {
        return 'ensureCountryStructure';
      }

      // If structure exists but patterns are sparse, do exploration
      if (playbook.patterns.length < 5) {
        return 'ensureAndExploreCountryHubs';
      }

      // If well-established, do full discovery
      return 'fullCountryHubDiscovery';
    } catch (error) {
      return null;
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this._ownedPlaybook && this._playbook && typeof this._playbook.close === 'function') {
      this._playbook.close();
      this._playbook = null;
    }
  }

  /**
   * Default retry strategy when playbook unavailable
   * @private
   */
  _defaultRetryStrategy() {
    return {
      maxAttempts: 3,
      backoffMs: [1000, 5000, 15000],
      shouldRetry: true,
      strategy: 'exponential',
      learnedFrom: 'default'
    };
  }
}

/**
 * Factory function for creating context adapters
 */
function createSequenceContext(options = {}) {
  return new SequenceContextAdapter(options);
}

module.exports = {
  SequenceContextAdapter,
  createSequenceContext
};
