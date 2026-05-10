'use strict';

const DEFAULT_INITIAL_LIMIT = 500;
const DEFAULT_MIN_LIMIT = 1;
const DEFAULT_TARGET_MS = 5000;
const DEFAULT_FAST_RATIO = 0.6;
const DEFAULT_GROWTH_FACTOR = 1.5;
const DEFAULT_SHRINK_FACTOR = 0.5;
const DEFAULT_FAST_STREAK_TO_GROW = 3;

function parsePositiveInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOption(options, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(options, name)) return options[name];
  }
  return undefined;
}

function isTruthy(value) {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function normalizeAdaptiveBatchOptions(options = {}) {
  const initialLimit = parsePositiveInteger(
    readOption(options, ['initialLimit', 'limit']),
    DEFAULT_INITIAL_LIMIT
  );
  const minLimit = parsePositiveInteger(
    readOption(options, ['minLimit', 'min-limit']),
    DEFAULT_MIN_LIMIT
  );
  const maxLimit = Math.max(
    minLimit,
    parsePositiveInteger(readOption(options, ['maxLimit', 'max-limit']), Math.max(initialLimit, minLimit))
  );
  const targetMs = parsePositiveInteger(
    readOption(options, ['targetMs', 'targetSyncMs', 'target-sync-ms']),
    DEFAULT_TARGET_MS
  );
  const fastRatio = Number(readOption(options, ['fastRatio', 'fast-ratio'])) || DEFAULT_FAST_RATIO;
  const growthFactor = Number(readOption(options, ['growthFactor', 'growth-factor'])) || DEFAULT_GROWTH_FACTOR;
  const shrinkFactor = Number(readOption(options, ['shrinkFactor', 'shrink-factor'])) || DEFAULT_SHRINK_FACTOR;
  const fastStreakToGrow = parsePositiveInteger(
    readOption(options, ['fastStreakToGrow', 'fast-streak-to-grow']),
    DEFAULT_FAST_STREAK_TO_GROW
  );
  const targetWasSpecified = readOption(options, ['targetMs', 'targetSyncMs', 'target-sync-ms']) !== undefined;
  const enabled = isTruthy(readOption(options, ['enabled', 'adaptiveLimit', 'adaptive-limit', 'adaptiveBatching', 'adaptive-batching']))
    || targetWasSpecified;

  return {
    enabled,
    initialLimit: clamp(initialLimit, minLimit, maxLimit),
    minLimit,
    maxLimit,
    targetMs,
    fastThresholdMs: Math.max(1, Math.floor(targetMs * fastRatio)),
    growthFactor: Math.max(1.01, growthFactor),
    shrinkFactor: Math.min(0.99, Math.max(0.1, shrinkFactor)),
    fastStreakToGrow,
  };
}

function createDecision(state, action, reason, previousLimit, details = {}) {
  return {
    enabled: state.options.enabled,
    action,
    reason,
    previousLimit,
    currentLimit: state.currentLimit,
    targetMs: state.options.targetMs,
    fastThresholdMs: state.options.fastThresholdMs,
    fastFullStreak: state.fastFullStreak,
    ...details,
  };
}

function createAdaptiveBatchController(rawOptions = {}) {
  const options = normalizeAdaptiveBatchOptions(rawOptions);
  const state = {
    options,
    currentLimit: options.initialLimit,
    fastFullStreak: 0,
  };

  function shrink(reason, details = {}) {
    const previousLimit = state.currentLimit;
    state.fastFullStreak = 0;
    let nextLimit = Math.floor(previousLimit * options.shrinkFactor);
    if (previousLimit > options.minLimit && nextLimit >= previousLimit) nextLimit = previousLimit - 1;
    state.currentLimit = clamp(nextLimit, options.minLimit, options.maxLimit);
    return createDecision(
      state,
      state.currentLimit < previousLimit ? 'shrink' : 'hold',
      state.currentLimit < previousLimit ? reason : 'min-limit',
      previousLimit,
      details
    );
  }

  function grow(reason, details = {}) {
    const previousLimit = state.currentLimit;
    state.fastFullStreak = 0;
    const nextLimit = Math.max(previousLimit + 1, Math.ceil(previousLimit * options.growthFactor));
    state.currentLimit = clamp(nextLimit, options.minLimit, options.maxLimit);
    return createDecision(
      state,
      state.currentLimit > previousLimit ? 'grow' : 'hold',
      state.currentLimit > previousLimit ? reason : 'max-limit',
      previousLimit,
      details
    );
  }

  function hold(reason, details = {}) {
    return createDecision(state, 'hold', reason, state.currentLimit, details);
  }

  return {
    isEnabled() {
      return options.enabled;
    },

    getOptions() {
      return { ...options };
    },

    getLimit() {
      return state.currentLimit;
    },

    recordSuccess(metrics = {}) {
      if (!options.enabled) return hold('fixed-limit', metrics);

      const durationMs = parsePositiveInteger(
        metrics.durationMs ?? metrics.roundMs ?? metrics.totalMs,
        0
      );
      const fetchedRows = parsePositiveInteger(
        metrics.fetchedRows ?? metrics.urls ?? metrics.rows,
        0
      );
      const wasFullBatch = fetchedRows >= state.currentLimit;

      if (durationMs > options.targetMs) {
        return shrink('slow-round', { ...metrics, durationMs, fetchedRows, wasFullBatch });
      }

      if (durationMs <= options.fastThresholdMs && wasFullBatch) {
        state.fastFullStreak += 1;
        if (state.fastFullStreak >= options.fastStreakToGrow) {
          return grow('fast-full-streak', { ...metrics, durationMs, fetchedRows, wasFullBatch });
        }
        return hold('fast-full-warmup', { ...metrics, durationMs, fetchedRows, wasFullBatch });
      }

      state.fastFullStreak = 0;
      return hold(wasFullBatch ? 'within-target' : 'partial-batch', { ...metrics, durationMs, fetchedRows, wasFullBatch });
    },

    recordEmpty(metrics = {}) {
      state.fastFullStreak = 0;
      return hold(options.enabled ? 'empty-batch' : 'fixed-limit', metrics);
    },

    recordError(metrics = {}) {
      if (!options.enabled) return hold('fixed-limit', metrics);
      return shrink('error-round', metrics);
    },
  };
}

module.exports = {
  createAdaptiveBatchController,
  normalizeAdaptiveBatchOptions,
};