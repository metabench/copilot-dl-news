'use strict';

const { CrawlContext } = require('../context');
const { RetryCoordinator } = require('../retry');
const { UrlDecisionOrchestrator } = require('../decisions');

/**
 * NewAbstractionsAdapter - Bridge between new abstractions and existing crawler.
 *
 * This adapter facilitates gradual migration from the old scattered state
 * to the new unified abstractions. It can be used in two modes:
 *
 * 1. Shadow mode: New abstractions track state alongside old code (for testing)
 * 2. Active mode: New abstractions replace old code paths
 *
 * Usage:
 * ```javascript
 * const adapter = NewAbstractionsAdapter.create(crawler, { mode: 'shadow' });
 * adapter.install();
 *
 * // Later, check consistency
 * const report = adapter.getConsistencyReport();
 * ```
 */
class NewAbstractionsAdapter {
  /**
   * @param {Object} crawler - The NewsCrawler instance
   * @param {Object} options
   * @param {string} options.mode - 'shadow' or 'active'
   * @param {boolean} options.logInconsistencies - Log when old/new state diverges
   */
  constructor(crawler, options = {}) {
    this.crawler = crawler;
    this.mode = options.mode || 'shadow';
    this.logInconsistencies = options.logInconsistencies ?? true;

    // Create new abstractions
    this.context = CrawlContext.create({
      jobId: crawler.config?.jobId || crawler.jobId,
      startUrl: crawler.startUrl,
      crawlType: crawler.config?.crawlType || 'basic',
      maxDepth: crawler.config?.maxDepth,
      maxPages: crawler.config?.maxPages
    });

    this.retryCoordinator = new RetryCoordinator({
      context: this.context,
      maxRetries: crawler.config?.maxRetries || 3
    });

    this.decisionOrchestrator = new UrlDecisionOrchestrator({
      context: this.context,
      robotsChecker: crawler.robotsChecker,
      config: {
        stayOnDomain: crawler.config?.stayOnDomain ?? true,
        startDomain: this._extractDomain(crawler.startUrl),
        maxDepth: crawler.config?.maxDepth,
        maxPages: crawler.config?.maxPages,
        skipQueryUrls: !crawler.config?.allowQueryUrls,
        respectRobots: crawler.config?.respectRobots ?? true
      }
    });

    // Track inconsistencies
    this._inconsistencies = [];

    // Installed state
    this._installed = false;
    this._originalMethods = {};
  }

  /**
   * Install the adapter on the crawler.
   * In shadow mode, this adds listeners to track state.
   * In active mode, this replaces methods with new implementations.
   */
  install() {
    if (this._installed) return;

    if (this.mode === 'shadow') {
      this._installShadowMode();
    } else {
      this._installActiveMode();
    }

    this._installed = true;
  }

  /**
   * Uninstall the adapter, restoring original behavior.
   */
  uninstall() {
    if (!this._installed) return;

    const crawler = this.crawler;

    // Restore state.visited.add
    if (this._originalMethods._stateVisitedAdd && crawler.state?.visited) {
      crawler.state.visited.add = this._originalMethods._stateVisitedAdd;
    }

    // Restore state increment methods
    if (this._originalMethods._incrementArticlesFound && crawler.state) {
      crawler.state.incrementArticlesFound = this._originalMethods._incrementArticlesFound;
    }
    if (this._originalMethods._incrementErrors && crawler.state) {
      crawler.state.incrementErrors = this._originalMethods._incrementErrors;
    }
    if (this._originalMethods._incrementBytesDownloaded && crawler.state) {
      crawler.state.incrementBytesDownloaded = this._originalMethods._incrementBytesDownloaded;
    }

    // Restore telemetry methods
    if (this._originalMethods._telemetryProblem && crawler.telemetry) {
      crawler.telemetry.problem = this._originalMethods._telemetryProblem;
    }
    if (this._originalMethods._telemetryMilestone && crawler.telemetry) {
      crawler.telemetry.milestone = this._originalMethods._telemetryMilestone;
    }

    // Restore other crawler methods
    for (const [name, method] of Object.entries(this._originalMethods)) {
      if (!name.startsWith('_') && typeof method === 'function') {
        crawler[name] = method;
      }
    }

    // Clean up references
    delete crawler._shadowContext;
    delete crawler._abstractionsAdapter;

    this._installed = false;
  }

  /**
   * Shadow mode: Hook into crawler internals to mirror state in new abstractions.
   * Since the crawler doesn't emit page:processed/url:queued events directly,
   * we intercept key methods to track state changes.
   * @private
   */
  _installShadowMode() {
    const crawler = this.crawler;
    const ctx = this.context;

    // Hook into CrawlerState to mirror visits
    if (crawler.state && crawler.state.visited) {
      const origAdd = crawler.state.visited.add.bind(crawler.state.visited);
      crawler.state.visited.add = (url) => {
        const result = origAdd(url);
        ctx.markVisited(url, {});
        return result;
      };
      this._originalMethods._stateVisitedAdd = origAdd;
    }

    // Hook into stats increments for article tracking
    if (crawler.state) {
      const origIncrementArticles = crawler.state.incrementArticlesFound?.bind(crawler.state);
      if (origIncrementArticles) {
        crawler.state.incrementArticlesFound = (amount = 1) => {
          const result = origIncrementArticles(amount);
          // Direct _stats access for shadow mode - ctx.stats returns immutable copy
          ctx._stats.articles = (ctx._stats.articles || 0) + amount;
          return result;
        };
        this._originalMethods._incrementArticlesFound = origIncrementArticles;
      }

      const origIncrementErrors = crawler.state.incrementErrors?.bind(crawler.state);
      if (origIncrementErrors) {
        crawler.state.incrementErrors = (amount = 1) => {
          const result = origIncrementErrors(amount);
          ctx._stats.errors = (ctx._stats.errors || 0) + amount;
          return result;
        };
        this._originalMethods._incrementErrors = origIncrementErrors;
      }

      const origIncrementBytes = crawler.state.incrementBytesDownloaded?.bind(crawler.state);
      if (origIncrementBytes) {
        crawler.state.incrementBytesDownloaded = (bytes) => {
          const result = origIncrementBytes(bytes);
          if (typeof bytes === 'number' && bytes > 0) {
            ctx.recordDownload(bytes, 0);
          }
          return result;
        };
        this._originalMethods._incrementBytesDownloaded = origIncrementBytes;
      }
    }

    // Mirror problems/milestones via telemetry hooks
    if (crawler.telemetry) {
      const origProblem = crawler.telemetry.problem?.bind(crawler.telemetry);
      const origMilestone = crawler.telemetry.milestone?.bind(crawler.telemetry);

      if (origProblem) {
        crawler.telemetry.problem = (data) => {
          ctx.addProblem(data);
          return origProblem(data);
        };
        this._originalMethods._telemetryProblem = origProblem;
      }

      if (origMilestone) {
        crawler.telemetry.milestone = (data) => {
          ctx.addMilestone(data);
          return origMilestone(data);
        };
        this._originalMethods._telemetryMilestone = origMilestone;
      }
    }

    // Listen to existing crawler lifecycle events
    crawler.on('paused', () => {
      ctx.pause();
    });

    crawler.on('resumed', () => {
      ctx.resume();
    });

    // Expose context on crawler for inspection
    crawler._shadowContext = ctx;
    crawler._abstractionsAdapter = this;

    // Periodically check consistency
    this._consistencyInterval = setInterval(() => {
      this._checkConsistency();
    }, 10000);
  }

  /**
   * Active mode: Replace crawler methods with new implementations.
   * @private
   */
  _installActiveMode() {
    const crawler = this.crawler;
    const ctx = this.context;
    const retry = this.retryCoordinator;
    const decisions = this.decisionOrchestrator;

    // Replace URL decision method
    if (crawler.shouldProcessUrl) {
      this._originalMethods.shouldProcessUrl = crawler.shouldProcessUrl.bind(crawler);
      crawler.shouldProcessUrl = async (url, metadata = {}) => {
        const decision = await decisions.decide(url, metadata);
        return decision.action === 'fetch' || decision.action === 'cache';
      };
    }

    // Replace retry decision method
    if (crawler.shouldRetry) {
      this._originalMethods.shouldRetry = crawler.shouldRetry.bind(crawler);
      crawler.shouldRetry = async (request) => {
        const decision = await retry.shouldRetry(request);
        return decision;
      };
    }

    // Expose new abstractions on crawler
    crawler.crawlContext = ctx;
    crawler.retryCoordinator = retry;
    crawler.urlDecisions = decisions;

    // Start context when crawl starts
    const origCrawl = crawler.crawl?.bind(crawler);
    if (origCrawl) {
      this._originalMethods.crawl = origCrawl;
      crawler.crawl = async (...args) => {
        ctx.start();
        try {
          const result = await origCrawl(...args);
          ctx.finish('completed');
          return result;
        } catch (error) {
          ctx.finish('failed', error.message);
          throw error;
        }
      };
    }
  }

  /**
   * Check consistency between old and new state.
   * @private
   */
  _checkConsistency() {
    const crawler = this.crawler;
    const ctx = this.context;

    // Check visited count
    const oldVisited = crawler.state?.visited || crawler.stats?.visited || 0;
    const newVisited = ctx.stats.visited;

    if (Math.abs(oldVisited - newVisited) > 5) {
      this._recordInconsistency('visited-count', {
        old: oldVisited,
        new: newVisited,
        diff: oldVisited - newVisited
      });
    }

    // Check article count
    const oldArticles = crawler.state?.articles || crawler.stats?.articles || 0;
    const newArticles = ctx.stats.articles;

    if (Math.abs(oldArticles - newArticles) > 2) {
      this._recordInconsistency('article-count', {
        old: oldArticles,
        new: newArticles,
        diff: oldArticles - newArticles
      });
    }
  }

  /**
   * Record an inconsistency.
   * @private
   */
  _recordInconsistency(type, details) {
    const entry = {
      type,
      details,
      timestamp: Date.now()
    };

    this._inconsistencies.push(entry);

    if (this.logInconsistencies) {
      console.warn(`[NewAbstractionsAdapter] Inconsistency detected: ${type}`, details);
    }
  }

  /**
   * Get a report of all inconsistencies found.
   */
  getConsistencyReport() {
    return {
      mode: this.mode,
      inconsistencies: this._inconsistencies,
      summary: {
        total: this._inconsistencies.length,
        byType: this._inconsistencies.reduce((acc, i) => {
          acc[i.type] = (acc[i.type] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }

  /**
   * Get current state comparison.
   */
  getStateComparison() {
    const crawler = this.crawler;
    const ctx = this.context;

    return {
      oldState: {
        visited: crawler.state?.visited || crawler.stats?.visited || 0,
        queued: crawler.state?.queued || crawler.stats?.queued || 0,
        articles: crawler.state?.articles || crawler.stats?.articles || 0,
        errors: crawler.state?.errors || crawler.stats?.errors || 0
      },
      newState: ctx.stats,
      newContext: ctx.toJSON()
    };
  }

  /**
   * Get the new abstractions for direct use.
   */
  getAbstractions() {
    return {
      context: this.context,
      retryCoordinator: this.retryCoordinator,
      decisionOrchestrator: this.decisionOrchestrator
    };
  }

  /**
   * Extract domain from URL.
   * @private
   */
  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (e) {
      return null;
    }
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    if (this._consistencyInterval) {
      clearInterval(this._consistencyInterval);
    }
    this.uninstall();
  }

  /**
   * Factory method.
   */
  static create(crawler, options = {}) {
    return new NewAbstractionsAdapter(crawler, options);
  }
}

module.exports = NewAbstractionsAdapter;
