'use strict';

/**
 * Storage budget controller — decides what limit / action the sync loop
 * should take given remote node storage usage.
 *
 * Inputs:
 *   { remoteContentBytes, remoteUrlRows, budgetMb, reserveMb, currentLimit, minLimit, maxLimit }
 *
 * Output:
 *   { action, targetLimit, headroomMb, reason }
 *
 * Actions:
 *   'normal'     — under the normal budget, keep current limit
 *   'shrink'     — over the budget threshold, shrink to drain faster (small batches)
 *   'pause-crawl'— above hard reserve, ask remote to throttle/pause crawler
 */

const MB = 1024 * 1024;

function clampLimit(value, minLimit, maxLimit) {
  let v = Math.floor(Number(value));
  if (!Number.isFinite(v) || v <= 0) v = 1;
  if (Number.isFinite(minLimit) && v < minLimit) v = minLimit;
  if (Number.isFinite(maxLimit) && v > maxLimit) v = maxLimit;
  return v;
}

function evaluateStorageBudget(input = {}) {
  const remoteContentBytes = Number(input.remoteContentBytes) || 0;
  const remoteContentMb = remoteContentBytes / MB;
  const budgetMb = Number(input.budgetMb) > 0 ? Number(input.budgetMb) : null;
  const reserveMb = Number(input.reserveMb) > 0 ? Number(input.reserveMb) : null;
  const currentLimit = Number(input.currentLimit) > 0 ? Number(input.currentLimit) : 5;
  const minLimit = Number(input.minLimit) > 0 ? Number(input.minLimit) : 1;
  const maxLimit = Number(input.maxLimit) > 0 ? Number(input.maxLimit) : currentLimit;

  if (!budgetMb) {
    return {
      action: 'normal',
      targetLimit: clampLimit(currentLimit, minLimit, maxLimit),
      headroomMb: null,
      remoteContentMb,
      reason: 'no-budget',
    };
  }

  const headroomMb = budgetMb - remoteContentMb;

  if (reserveMb && remoteContentMb >= budgetMb + reserveMb) {
    const hardCeilingMb = budgetMb + reserveMb;
    return {
      action: 'pause-crawl',
      targetLimit: clampLimit(minLimit, minLimit, maxLimit),
      headroomMb,
      remoteContentMb,
      reason: `remote ${remoteContentMb.toFixed(1)}MB >= ceiling ${hardCeilingMb.toFixed(1)}MB`,
    };
  }

  if (remoteContentMb >= budgetMb) {
    // shrink to a small batch to drain quickly
    const target = clampLimit(Math.max(minLimit, Math.floor(currentLimit / 2)), minLimit, maxLimit);
    return {
      action: 'shrink',
      targetLimit: target,
      headroomMb,
      remoteContentMb,
      reason: `remote ${remoteContentMb.toFixed(1)}MB >= budget ${budgetMb.toFixed(1)}MB`,
    };
  }

  return {
    action: 'normal',
    targetLimit: clampLimit(currentLimit, minLimit, maxLimit),
    headroomMb,
    remoteContentMb,
    reason: 'under-budget',
  };
}

function normalizeStorageBudgetOptions(args = {}) {
  const budgetMb = Number(args['remote-storage-budget-mb'] ?? args.remoteStorageBudgetMb);
  const reserveMb = Number(args['remote-storage-reserve-mb'] ?? args.remoteStorageReserveMb);
  return {
    enabled: Number.isFinite(budgetMb) && budgetMb > 0,
    budgetMb: Number.isFinite(budgetMb) && budgetMb > 0 ? budgetMb : null,
    reserveMb: Number.isFinite(reserveMb) && reserveMb > 0 ? reserveMb : null,
  };
}

module.exports = {
  evaluateStorageBudget,
  normalizeStorageBudgetOptions,
  MB,
};
