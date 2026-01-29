'use strict';

const {
  createContext,
  isBudgetExhausted,
  getRemainingMs
} = require('./types');

/**
 * PlannerHost: Cooperative multi-plugin planning orchestrator with time budgets.
 * 
 * Architecture:
 * - Plugins implement { pluginId, priority, init(), tick(), teardown() }
 * - Cooperative ticking: Each plugin gets one tick per loop iteration
 * - Blackboard pattern: Shared working memory (ctx.bb) for inter-plugin communication
 * - Time budget enforcement: Planning completes within budgetMs (default 3.5s)
 * - Graceful degradation: Plugin failures don't crash the host
 * 
 * Ticking Loop:
 * 1. Sort plugins by priority (high to low)
 * 2. Call init() on each plugin once
 * 3. Loop: tick each plugin until done OR budget exhausted
 * 4. Call teardown() on each plugin
 * 5. Return blackboard + telemetry events
 */
class PlannerHost {
  constructor({
    plugins = [],
    options = {},
    emit = null,
    fetchPage = null,
    dbAdapter = null,
    logger = console,
    budgetMs = 3500,
    preview = false
  } = {}) {
    if (!Array.isArray(plugins) || plugins.length === 0) {
      throw new Error('PlannerHost requires at least one plugin');
    }

    this.plugins = plugins.slice().sort((a, b) => {
      const priorityA = typeof a.priority === 'number' ? a.priority : 50;
      const priorityB = typeof b.priority === 'number' ? b.priority : 50;
      return priorityB - priorityA; // Descending (higher priority first)
    });

    this.options = options;
    this.emit = emit;
    this.fetchPage = fetchPage;
    this.dbAdapter = dbAdapter;
    this.logger = logger;
    this.budgetMs = budgetMs;
    this.preview = preview;

    this.telemetryEvents = [];
  }

  /**
   * Run planning session with cooperative ticking.
   * @returns {Promise<Object>} { blackboard, telemetryEvents, elapsedMs, budgetExceeded, statusReason }
   */
  async run() {
    const startTime = Date.now();
    const ctx = createContext({
      options: this.options,
      emit: this._createEmitter(),
      fetchPage: this.fetchPage,
      dbAdapter: this.dbAdapter,
      logger: this.logger,
      budgetMs: this.budgetMs,
      preview: this.preview
    });

    this._logDebug(`PlannerHost: Starting with ${this.plugins.length} plugin(s), budget ${this.budgetMs}ms`);

    // Phase 1: Initialize plugins
    for (const plugin of this.plugins) {
      try {
        this._logDebug(`PlannerHost: Initializing ${plugin.pluginId}`);
        if (typeof plugin.init === 'function') {
          await plugin.init(ctx);
        }
      } catch (err) {
        this._logError(`PlannerHost: Plugin ${plugin.pluginId} init failed: ${err.message}`, err);
        ctx.bb.rationale.push(`Plugin ${plugin.pluginId} initialization failed`);
      }
    }

    // Phase 2: Cooperative ticking loop
    const pluginDone = new Map(this.plugins.map(p => [p.pluginId, false]));
    let loopCount = 0;
    const maxLoops = 100; // Safety: prevent infinite loops

    while (loopCount < maxLoops && !isBudgetExhausted(ctx)) {
      loopCount++;
      let allDone = true;

      for (const plugin of this.plugins) {
        if (pluginDone.get(plugin.pluginId)) {
          continue; // Skip already-done plugins
        }

        try {
          const isDone = await plugin.tick(ctx);
          if (isDone === true) {
            this._logDebug(`PlannerHost: Plugin ${plugin.pluginId} signaled done after ${loopCount} loop(s)`);
            pluginDone.set(plugin.pluginId, true);
          } else {
            allDone = false;
          }
        } catch (err) {
          this._logError(`PlannerHost: Plugin ${plugin.pluginId} tick failed: ${err.message}`, err);
          pluginDone.set(plugin.pluginId, true); // Mark failed plugin as done
          ctx.bb.rationale.push(`Plugin ${plugin.pluginId} encountered error during planning`);
        }

        // Check budget after each plugin tick
        if (isBudgetExhausted(ctx)) {
          this._logDebug(`PlannerHost: Time budget exhausted after ${loopCount} loop(s), remaining ${getRemainingMs(ctx)}ms`);
          break;
        }
      }

      if (allDone) {
        this._logDebug(`PlannerHost: All plugins done after ${loopCount} loop(s)`);
        break;
      }
    }

    if (loopCount >= maxLoops) {
      this._logWarn(`PlannerHost: Reached max loop count (${maxLoops}), terminating`);
      ctx.bb.rationale.push('Planning terminated due to max loop count');
    }

    // Phase 3: Teardown plugins
    for (const plugin of this.plugins) {
      try {
        this._logDebug(`PlannerHost: Tearing down ${plugin.pluginId}`);
        if (typeof plugin.teardown === 'function') {
          await plugin.teardown(ctx);
        }
      } catch (err) {
        this._logError(`PlannerHost: Plugin ${plugin.pluginId} teardown failed: ${err.message}`, err);
      }
    }

    const elapsedMs = Date.now() - startTime;
    const budgetExceeded = elapsedMs >= this.budgetMs;
    const statusReason = budgetExceeded
      ? `Planning completed with budget exhausted (${elapsedMs}ms of ${this.budgetMs}ms)`
      : `Planning completed successfully in ${elapsedMs}ms (${loopCount} loop(s))`;

    this._logDebug(`PlannerHost: ${statusReason}`);

    return {
      blackboard: ctx.bb,
      telemetryEvents: this.telemetryEvents,
      elapsedMs,
      budgetExceeded,
      statusReason
    };
  }

  /**
   * Create an emitter that captures telemetry events.
   * @private
   */
  _createEmitter() {
    return (type, data) => {
      const event = {
        type,
        data,
        timestamp: Date.now()
      };
      this.telemetryEvents.push(event);

      // Forward to external emitter if provided
      if (typeof this.emit === 'function') {
        try {
          this.emit(type, data);
        } catch (err) {
          this._logError(`PlannerHost: External emitter failed for event ${type}: ${err.message}`, err);
        }
      }
    };
  }

  _logDebug(message) {
    if (this.logger && typeof this.logger.debug === 'function') {
      this.logger.debug(message);
    }
  }

  _logWarn(message) {
    if (this.logger && typeof this.logger.warn === 'function') {
      this.logger.warn(message);
    }
  }

  _logError(message, error) {
    if (this.logger && typeof this.logger.error === 'function') {
      this.logger.error(message, error);
    }
  }
}

module.exports = { PlannerHost };
