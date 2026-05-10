'use strict';

/**
 * Sync loop instrumentation — extracts per-round telemetry from the
 * sync loop so both cmdSync and cmdRun emit identical perf summaries,
 * storage-budget evaluations, and backpressure transitions.
 *
 * Pure-policy module: no side-effects beyond console.log. The caller
 * owns the HTTP transport, DB, and sleep lifecycle.
 *
 * @module tools/crawl/lib/sync-loop-instrumentation
 */

const { createPerfReporter } = require('./perf-reporter');
const { evaluateStorageBudget, normalizeStorageBudgetOptions } = require('./storage-budget');
const { evaluateBackpressure } = require('./backpressure');

/**
 * Create an instrumentation instance for the sync loop.
 *
 * @param {object} options
 * @param {object} options.budgetOptions - from normalizeStorageBudgetOptions
 * @param {number} options.perfPrintEvery - how often to print perf summary (rounds)
 * @param {number} options.initialLimit - starting export limit
 * @param {object} [options.argOverrides] - CLI arg overrides for budget limits
 * @returns {{ onRoundSuccess, onRoundError, printSummary, getBackpressureState }}
 */
function createInstrumentation({
  budgetOptions,
  perfPrintEvery = 10,
  initialLimit = 5,
  argOverrides = {},
} = {}) {
  const perfReporter = createPerfReporter({ capacity: 60 });
  const budget = budgetOptions || { enabled: false };
  let lastBackpressureAction = 'normal';
  let roundCounter = 0;

  function parseArg(name) {
    const v = parseInt(argOverrides[name], 10);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }

  /**
   * Record metrics for a successful sync round.
   *
   * @param {object} metrics
   * @param {number} metrics.fetchMs
   * @param {number} metrics.ingestMs
   * @param {number} metrics.roundMs
   * @param {number} metrics.rows - url count in batch
   * @param {number} metrics.bytes - content count in batch
   * @param {object|null} metrics.pruneResult
   * @param {number} metrics.currentLimit - current batch controller limit
   * @returns {{ perfLine: string|null, budgetResult: object|null }}
   */
  function onRoundSuccess(metrics = {}) {
    roundCounter++;
    const {
      fetchMs = 0, ingestMs = 0, roundMs = 0,
      rows = 0, bytes = 0, pruneResult = null,
      currentLimit = initialLimit,
    } = metrics;

    perfReporter.record({
      fetchMs,
      ingestMs,
      verifyMs: 0,
      pruneMs: pruneResult?.durationMs || 0,
      totalMs: roundMs,
      rows,
      bytes,
    });

    let perfLine = null;
    if (roundCounter % perfPrintEvery === 0) {
      const s = perfReporter.summary();
      if (s.samples) {
        perfLine = `  ↳ perf p50/p95 fetch=${s.fetchMs.p50}/${s.fetchMs.p95}ms ingest=${s.ingestMs.p50}/${s.ingestMs.p95}ms total=${s.totalMs.p50}/${s.totalMs.p95}ms rows/s=${s.rowsPerSec.toFixed(2)} samples=${s.samples}`;
      }
    }

    return { perfLine, budgetResult: null };
  }

  /**
   * Evaluate storage budget and backpressure.
   *
   * @param {object} opts
   * @param {number} opts.remoteContentBytes - from /api/content/stats
   * @param {number} opts.currentLimit
   * @returns {{ budgetDecision: object, backpressure: object|null, transitioned: boolean }}
   */
  function evaluateBudget({ remoteContentBytes, currentLimit }) {
    if (!budget.enabled) return { budgetDecision: null, backpressure: null, transitioned: false };

    const budgetDecision = evaluateStorageBudget({
      remoteContentBytes,
      budgetMb: budget.budgetMb,
      reserveMb: budget.reserveMb,
      currentLimit,
      minLimit: parseArg('min-limit') || 1,
      maxLimit: parseArg('max-limit') || initialLimit,
    });

    let backpressure = null;
    let transitioned = false;

    if (budgetDecision.action !== lastBackpressureAction) {
      backpressure = evaluateBackpressure({
        action: budgetDecision.action,
        currentConcurrency: parseArg('max-concurrent') || 10,
        normalConcurrency: parseArg('normal-concurrency') || parseArg('max-concurrent') || 10,
        reducedConcurrency: parseArg('reduced-concurrency') || 2,
        reason: budgetDecision.reason,
      });
      transitioned = backpressure.changed;
      lastBackpressureAction = budgetDecision.action;
    }

    return { budgetDecision, backpressure, transitioned };
  }

  function onRoundError() {
    roundCounter++;
  }

  /**
   * Return the current perf summary.
   */
  function printSummary() {
    return perfReporter.summary();
  }

  function getBackpressureState() {
    return { lastAction: lastBackpressureAction };
  }

  function getRoundCount() {
    return roundCounter;
  }

  return {
    onRoundSuccess,
    onRoundError,
    evaluateBudget,
    printSummary,
    getBackpressureState,
    getRoundCount,
  };
}

module.exports = { createInstrumentation };
