"use strict";

const { EventEmitter } = require("events");

/**
 * MultiModalCrawlManager
 *
 * Runs multiple multi-modal crawls concurrently with a configurable parallel limit.
 * Emits the same event types as MultiModalCrawlOrchestrator, augmented with domain.
 */
class MultiModalCrawlManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Function} options.createOrchestrator - Factory returning { orchestrator, patternTracker, balancer }
   * @param {number} [options.maxParallel=2] - Max concurrent domains
   * @param {Object} [options.logger] - Logger instance
   */
  constructor({ createOrchestrator, maxParallel = 2, logger = console } = {}) {
    super();
    if (typeof createOrchestrator !== "function") {
      throw new Error("MultiModalCrawlManager requires a createOrchestrator function");
    }
    this.createOrchestrator = createOrchestrator;
    this.maxParallel = maxParallel;
    this.logger = logger;
    this.sessions = new Map(); // domain -> session
    this.queue = [];
    this.isRunning = false;
  }

  /**
   * Start crawls for one or more domains.
   * @param {string|string[]} domains
   * @param {Object} [config]
   * @param {Object} [options]
   * @param {number} [options.maxParallel]
   * @returns {Promise<Array<Object>>} Results when all queued sessions finish.
   */
  async start(domains, config = {}, { maxParallel } = {}) {
    const domainList = Array.isArray(domains) ? domains : [domains];
    const uniqueDomains = domainList.filter(Boolean).filter((domain, idx, arr) => arr.indexOf(domain) === idx);
    const limit = Number.isFinite(maxParallel) ? Math.max(1, Math.floor(maxParallel)) : this.maxParallel;

    if (uniqueDomains.length === 0) {
      return [];
    }

    if (this.isRunning) {
      throw new Error("MultiModalCrawlManager already running");
    }

    this.isRunning = true;
    this.queue = uniqueDomains.slice();
    const results = [];

    const runNext = async () => {
      if (!this.isRunning) return;
      const domain = this.queue.shift();
      if (!domain) return;

      const session = this._startDomain(domain, config);
      try {
        const stats = await session.promise;
        results.push(stats);
      } catch (error) {
        results.push({
          domain,
          error: error?.message || String(error)
        });
      } finally {
        this.sessions.delete(domain);
        if (this.queue.length > 0 && this.isRunning) {
          await runNext();
        }
      }
    };

    const starters = [];
    for (let i = 0; i < Math.min(limit, this.queue.length); i += 1) {
      starters.push(runNext());
    }

    await Promise.all(starters);
    this.isRunning = false;
    return results;
  }

  /**
   * Stop all running sessions or a specific domain.
   * @param {string} [domain]
   */
  stop(domain = null) {
    if (!this.isRunning && this.sessions.size === 0) {
      return;
    }
    if (domain) {
      const session = this.sessions.get(domain);
      session?.orchestrator?.stop?.();
      return;
    }
    this.isRunning = false;
    this.queue = [];
    for (const session of this.sessions.values()) {
      session.orchestrator?.stop?.();
    }
  }

  /**
   * Pause all sessions or a specific domain.
   * @param {string} [domain]
   */
  pause(domain = null) {
    if (domain) {
      const session = this.sessions.get(domain);
      session?.orchestrator?.pause?.();
      return;
    }
    for (const session of this.sessions.values()) {
      session.orchestrator?.pause?.();
    }
  }

  /**
   * Resume all sessions or a specific domain.
   * @param {string} [domain]
   */
  resume(domain = null) {
    if (domain) {
      const session = this.sessions.get(domain);
      session?.orchestrator?.resume?.();
      return;
    }
    for (const session of this.sessions.values()) {
      session.orchestrator?.resume?.();
    }
  }

  /**
   * Get stats for active sessions.
   * @returns {Array<Object>}
   */
  getSessionStats() {
    return Array.from(this.sessions.values()).map((session) => ({
      domain: session.domain,
      stats: session.orchestrator?.getStatistics?.() || null
    }));
  }

  _startDomain(domain, config) {
    const { orchestrator } = this.createOrchestrator(config);
    const session = {
      domain,
      orchestrator
    };

    this.sessions.set(domain, session);

    const forward = (event) => {
      orchestrator.on(event, (payload = {}) => {
        this.emit(event, {
          domain,
          ...payload
        });
      });
    };

    [
      "phase-change",
      "batch-complete",
      "pattern-learned",
      "hub-discovered",
      "reanalysis-triggered",
      "progress",
      "analysis-progress"
    ].forEach(forward);

    orchestrator.on("error", (error) => {
      this.emit("error", {
        domain,
        error: error?.message || String(error)
      });
    });

    this.emit("crawl-started", { domain });

    session.promise = orchestrator.start(domain, config)
      .then((stats) => {
        this.emit("crawl-complete", { domain, stats });
        return stats;
      })
      .catch((error) => {
        this.emit("crawl-error", { domain, error });
        throw error;
      });

    return session;
  }
}

module.exports = { MultiModalCrawlManager };
