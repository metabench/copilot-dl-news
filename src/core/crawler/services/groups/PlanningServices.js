'use strict';

/**
 * PlanningServices - Crawl planning and strategy services.
 *
 * Groups:
 * - planner: Crawl strategy planner
 * - adaptiveSeed: Adaptive URL seeding
 * - milestoneTracker: Progress milestones
 * - planning (facade): Unified planning interface
 *
 * @param {ServiceContainer} container - The service container
 * @param {Object} config - Crawler configuration
 */
function registerPlanningServices(container, config) {
  // Milestone tracker
  container.register('milestoneTracker', (c) => {
    const context = c.get('context');

    return {
      _emitted: new Set(),

      /**
       * Emit a milestone (once per kind).
       * @param {string} kind
       * @param {Object} data
       */
      emit(kind, data = {}) {
        if (this._emitted.has(kind)) return null;
        this._emitted.add(kind);
        return context.addMilestone({ kind, ...data });
      },

      /**
       * Emit a repeatable milestone.
       * @param {string} kind
       * @param {Object} data
       */
      emitRepeatable(kind, data = {}) {
        return context.addMilestone({ kind, ...data });
      },

      /**
       * Check if milestone was emitted.
       * @param {string} kind
       * @returns {boolean}
       */
      hasEmitted(kind) {
        return this._emitted.has(kind);
      },

      /**
       * Get all milestones.
       * @returns {Array}
       */
      getAll() {
        return context.milestones;
      }
    };
  }, { group: 'planning', dependencies: ['context'] });

  // Adaptive seed manager
  container.register('adaptiveSeed', (c) => {
    const context = c.get('context');

    return {
      _seeds: [],
      _exhausted: new Set(),

      /**
       * Add a seed URL.
       * @param {string} url
       * @param {Object} metadata
       */
      addSeed(url, metadata = {}) {
        if (this._exhausted.has(url)) return false;
        this._seeds.push({ url, priority: metadata.priority || 0, ...metadata });
        this._seeds.sort((a, b) => b.priority - a.priority);
        return true;
      },

      /**
       * Get next seed URL.
       * @returns {Object|null}
       */
      getNextSeed() {
        while (this._seeds.length > 0) {
          const seed = this._seeds.shift();
          if (!context.hasSeen(seed.url)) {
            return seed;
          }
          this._exhausted.add(seed.url);
        }
        return null;
      },

      /**
       * Mark seed as exhausted.
       * @param {string} url
       */
      markExhausted(url) {
        this._exhausted.add(url);
        this._seeds = this._seeds.filter(s => s.url !== url);
      },

      /**
       * Get pending seed count.
       * @returns {number}
       */
      getPendingCount() {
        return this._seeds.length;
      }
    };
  }, { group: 'planning', dependencies: ['context'] });

  // Planner (strategy selection and coordination)
  container.register('planner', (c) => {
    const context = c.get('context');
    const milestoneTracker = c.get('milestoneTracker');

    return {
      _strategy: config.crawlType || 'basic',
      _phase: 'discovery',

      /**
       * Get current strategy.
       * @returns {string}
       */
      getStrategy() {
        return this._strategy;
      },

      /**
       * Set strategy.
       * @param {string} strategy
       */
      setStrategy(strategy) {
        this._strategy = strategy;
        milestoneTracker.emitRepeatable('strategy-changed', { strategy });
      },

      /**
       * Get current phase.
       * @returns {string}
       */
      getPhase() {
        return this._phase;
      },

      /**
       * Advance to next phase.
       * @param {string} phase
       */
      advancePhase(phase) {
        const previous = this._phase;
        this._phase = phase;
        milestoneTracker.emitRepeatable('phase-advanced', { previous, current: phase });
      },

      /**
       * Check if crawl goals are met.
       * @returns {boolean}
       */
      areGoalsMet() {
        // Basic goal check based on config
        if (config.maxPages && context.stats.visited >= config.maxPages) {
          return true;
        }
        if (config.minArticles && context.stats.articles >= config.minArticles) {
          return true;
        }
        return false;
      },

      /**
       * Get planning summary.
       * @returns {Object}
       */
      getSummary() {
        return {
          strategy: this._strategy,
          phase: this._phase,
          goalsmet: this.areGoalsMet(),
          stats: context.stats
        };
      }
    };
  }, { group: 'planning', dependencies: ['context', 'milestoneTracker'] });

  // Planning facade
  container.register('planning', (c) => {
    return {
      planner: c.get('planner'),
      seeds: c.get('adaptiveSeed'),
      milestones: c.get('milestoneTracker'),

      /**
       * Initialize planning for a crawl.
       * @param {string} startUrl
       * @param {Object} options
       */
      initialize(startUrl, options = {}) {
        const seeds = c.get('adaptiveSeed');
        seeds.addSeed(startUrl, { priority: 100, source: 'start' });

        if (options.additionalSeeds) {
          for (const seed of options.additionalSeeds) {
            seeds.addSeed(seed.url || seed, { priority: seed.priority || 50, source: 'additional' });
          }
        }

        c.get('milestoneTracker').emit('planning-initialized', { startUrl });
      },

      /**
       * Get next URL to crawl based on planning.
       * @returns {Object|null}
       */
      getNextTarget() {
        return c.get('adaptiveSeed').getNextSeed();
      },

      /**
       * Check if planning phase is complete.
       * @returns {boolean}
       */
      isComplete() {
        return c.get('planner').areGoalsMet();
      }
    };
  }, { group: 'facades', dependencies: ['planner', 'adaptiveSeed', 'milestoneTracker'] });
}

module.exports = { registerPlanningServices };
