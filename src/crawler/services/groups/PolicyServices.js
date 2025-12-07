'use strict';

const UrlDecisionOrchestrator = require('../../decisions/UrlDecisionOrchestrator');

/**
 * PolicyServices - URL policy and decision services.
 *
 * Groups:
 * - robotsChecker: Robots.txt parsing and checking
 * - urlDecisionOrchestrator: Centralized URL eligibility decisions
 * - policy (facade): Unified policy interface
 *
 * @param {ServiceContainer} container - The service container
 * @param {Object} config - Crawler configuration
 */
function registerPolicyServices(container, config) {
  // Robots.txt checker
  container.register('robotsChecker', (c) => {
    // Lazy require to avoid circular dependencies
    const RobotsChecker = require('../../RobotsChecker');
    return new RobotsChecker({
      userAgent: config.userAgent || 'NewsCrawlerBot/1.0',
      cache: c.tryGet('cache')
    });
  }, { group: 'policy', dependencies: ['cache'] });

  // URL decision orchestrator
  container.register('urlDecisionOrchestrator', (c) => {
    return new UrlDecisionOrchestrator({
      context: c.get('context'),
      robotsChecker: c.tryGet('robotsChecker'),
      config: {
        stayOnDomain: config.stayOnDomain !== false,
        startDomain: config.startDomain || null,
        allowedDomains: config.allowedDomains || null,
        blockedDomains: config.blockedDomains ? new Set(config.blockedDomains) : new Set(),
        maxDepth: config.maxDepth ?? Infinity,
        respectRobots: config.respectRobots !== false,
        skipQueryUrls: !config.allowQueryUrls,
        skipFragmentUrls: config.skipFragmentUrls !== false,
        blockedExtensions: config.blockedExtensions ? new Set(config.blockedExtensions) : undefined,
        blockedPathPatterns: config.blockedPathPatterns || undefined,
        maxPages: config.maxPages ?? null,
        maxAge: config.cacheMaxAge || null
      }
    });
  }, { group: 'policy', dependencies: ['context', 'robotsChecker'] });

  // UrlPolicy (legacy, wraps orchestrator for compatibility)
  container.register('urlPolicy', (c) => {
    // If legacy UrlPolicy class exists, use it; otherwise provide shim
    try {
      const UrlPolicy = require('../../UrlPolicy');
      return new UrlPolicy(config);
    } catch (e) {
      // Shim that delegates to orchestrator
      const orchestrator = c.get('urlDecisionOrchestrator');
      return {
        shouldFetch: (url, metadata) => orchestrator.shouldQueue(url, metadata).shouldQueue,
        decide: (url, metadata) => orchestrator.decide(url, metadata),
        isBlocked: (url) => {
          const result = orchestrator.shouldQueue(url, {});
          return !result.shouldQueue;
        }
      };
    }
  }, { group: 'policy', dependencies: ['urlDecisionOrchestrator'] });

  // Policy facade - unified interface for policy operations
  container.register('policy', (c) => {
    const orchestrator = c.get('urlDecisionOrchestrator');
    const robotsChecker = c.tryGet('robotsChecker');

    return {
      /** @type {UrlDecisionOrchestrator} */
      decisions: orchestrator,

      /** @type {Object|null} */
      robots: robotsChecker,

      /**
       * Check if a URL can be crawled.
       * @param {string} url
       * @param {Object} [metadata]
       * @returns {Promise<boolean>}
       */
      async canCrawl(url, metadata = {}) {
        const decision = await orchestrator.decide(url, metadata);
        return decision.action === 'fetch' || decision.action === 'cache';
      },

      /**
       * Quick synchronous check for queue eligibility.
       * @param {string} url
       * @param {Object} [metadata]
       * @returns {boolean}
       */
      shouldQueue(url, metadata = {}) {
        return orchestrator.shouldQueue(url, metadata).shouldQueue;
      },

      /**
       * Get full decision with reason.
       * @param {string} url
       * @param {Object} [metadata]
       * @returns {Promise<Object>}
       */
      async getDecision(url, metadata = {}) {
        return orchestrator.decide(url, metadata);
      },

      /**
       * Block a domain dynamically.
       * @param {string} domain
       */
      blockDomain(domain) {
        orchestrator.blockDomain(domain);
      },

      /**
       * Get policy statistics.
       * @returns {Object}
       */
      getStats() {
        return orchestrator.getStats();
      }
    };
  }, { group: 'facades', dependencies: ['urlDecisionOrchestrator', 'robotsChecker'] });
}

module.exports = { registerPolicyServices };
