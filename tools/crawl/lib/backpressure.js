'use strict';

/**
 * Backpressure controller — given storage budget evaluation + current
 * crawler concurrency, returns the new concurrency request and whether
 * to actively pause the crawler.
 *
 * Pure: no side-effects. The CLI sync loop calls this and POSTs to
 * /api/throttle on the remote when the desired concurrency changes.
 */

const DEFAULT_NORMAL_CONCURRENCY = 10;
const DEFAULT_REDUCED_CONCURRENCY = 2;

function evaluateBackpressure(input = {}) {
  const action = input.action || 'normal';
  const normal = Number(input.normalConcurrency) > 0 ? Math.floor(input.normalConcurrency) : DEFAULT_NORMAL_CONCURRENCY;
  const reduced = Number(input.reducedConcurrency) > 0 ? Math.floor(input.reducedConcurrency) : DEFAULT_REDUCED_CONCURRENCY;
  const currentConcurrency = Number(input.currentConcurrency) > 0 ? Math.floor(input.currentConcurrency) : normal;

  if (action === 'pause-crawl') {
    return {
      desiredConcurrency: 0,
      pause: true,
      changed: currentConcurrency !== 0,
      reason: input.reason || 'budget-ceiling',
    };
  }
  if (action === 'shrink') {
    const desired = Math.min(currentConcurrency, reduced);
    return {
      desiredConcurrency: desired,
      pause: false,
      changed: currentConcurrency !== desired,
      reason: input.reason || 'budget-pressure',
    };
  }
  // normal
  return {
    desiredConcurrency: normal,
    pause: false,
    changed: currentConcurrency !== normal,
    reason: input.reason || 'restore',
  };
}

module.exports = { evaluateBackpressure, DEFAULT_NORMAL_CONCURRENCY, DEFAULT_REDUCED_CONCURRENCY };
