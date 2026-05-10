'use strict';

const DEFAULT_DOMAINS = Object.freeze([
  'bbc.com',
  'theguardian.com',
  'reuters.com',
  'nytimes.com',
  'washingtonpost.com',
  'cnn.com',
  'apnews.com',
  'bloomberg.com',
  'ft.com',
  'npr.org',
]);

const DEFAULT_THRESHOLDS = Object.freeze({
  minNewResponses: 25,
  minSuccessResponses: 10,
  minContentRows: 5,
  minDistinctHosts: 3,
  maxFailureRatio: 0.6,
  maxUnconfirmedLedgerEntries: 0,
  maxUnprunedLedgerEntries: 2,
});

const DEFAULT_TIMING = Object.freeze({
  durationMin: 15,
  drainSeconds: 60,
  validationSeconds: 20,
  stopGraceSeconds: 15,
});

function toNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toPositiveNumber(value, fallback) {
  const numberValue = toNumber(value, fallback);
  return numberValue > 0 ? numberValue : fallback;
}

function toInteger(value, fallback) {
  const numberValue = Math.floor(toPositiveNumber(value, fallback));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeDomains(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return DEFAULT_DOMAINS.slice();
}

function normalizeValidationOptions(input = {}) {
  const durationMin = toPositiveNumber(input.durationMin ?? input['duration-min'], DEFAULT_TIMING.durationMin);
  const drainSeconds = toPositiveNumber(input.drainSeconds ?? input['drain-seconds'], DEFAULT_TIMING.drainSeconds);
  const validationSeconds = toPositiveNumber(input.validationSeconds ?? input['validation-seconds'], DEFAULT_TIMING.validationSeconds);
  const stopGraceSeconds = toPositiveNumber(input.stopGraceSeconds ?? input['stop-grace-seconds'], DEFAULT_TIMING.stopGraceSeconds);
  const durationMs = Math.floor(durationMin * 60 * 1000);
  const drainMs = Math.floor(drainSeconds * 1000);
  const validationMs = Math.floor(validationSeconds * 1000);
  const stopGraceMs = Math.floor(stopGraceSeconds * 1000);
  const reservedMs = drainMs + validationMs + stopGraceMs;

  if (durationMs <= reservedMs + 30_000) {
    throw new Error('duration-min must leave at least 30 seconds for useful crawling after drain/validation reserves');
  }

  const thresholds = {
    minNewResponses: toInteger(input.minNewResponses ?? input['min-new-responses'], DEFAULT_THRESHOLDS.minNewResponses),
    minSuccessResponses: toInteger(input.minSuccessResponses ?? input['min-success-responses'], DEFAULT_THRESHOLDS.minSuccessResponses),
    minContentRows: toInteger(input.minContentRows ?? input['min-content-rows'], DEFAULT_THRESHOLDS.minContentRows),
    minDistinctHosts: toInteger(input.minDistinctHosts ?? input['min-distinct-hosts'], DEFAULT_THRESHOLDS.minDistinctHosts),
    maxFailureRatio: toNumber(input.maxFailureRatio ?? input['max-failure-ratio'], DEFAULT_THRESHOLDS.maxFailureRatio),
    maxUnconfirmedLedgerEntries: toInteger(input.maxUnconfirmedLedgerEntries ?? input['max-unconfirmed-ledger-entries'], DEFAULT_THRESHOLDS.maxUnconfirmedLedgerEntries),
    maxUnprunedLedgerEntries: toInteger(input.maxUnprunedLedgerEntries ?? input['max-unpruned-ledger-entries'], DEFAULT_THRESHOLDS.maxUnprunedLedgerEntries),
  };

  return {
    host: input.host || '141.144.193.218:3200',
    domains: normalizeDomains(input.domains),
    maxPages: toInteger(input.maxPages ?? input['max-pages'], 1000),
    maxConcurrent: toInteger(input.maxConcurrent ?? input['max-concurrent'], 10),
    intervalSeconds: toInteger(input.interval ?? input.intervalSeconds, 5),
    windowSeconds: toInteger(input.window ?? input.windowSeconds, 5),
    initialLimit: toInteger(input.limit ?? input.initialLimit, 5),
    minLimit: toInteger(input.minLimit ?? input['min-limit'], 1),
    maxLimit: toInteger(input.maxLimit ?? input['max-limit'], 25),
    targetSyncMs: toInteger(input.targetSyncMs ?? input['target-sync-ms'], 5000),
    remoteStorageBudgetMb: toInteger(input.remoteStorageBudgetMb ?? input['remote-storage-budget-mb'], 512),
    remoteStorageReserveMb: toInteger(input.remoteStorageReserveMb ?? input['remote-storage-reserve-mb'], 256),
    normalConcurrency: toInteger(input.normalConcurrency ?? input['normal-concurrency'], 10),
    perfSummaryEvery: toInteger(input.perfSummaryEvery ?? input['perf-summary-every'], 3),
    drainRounds: toInteger(input.drainRounds ?? input['drain-rounds'], 12),
    durationMin,
    durationMs,
    drainSeconds,
    drainMs,
    validationSeconds,
    validationMs,
    stopGraceSeconds,
    stopGraceMs,
    crawlBudgetMs: durationMs - reservedMs,
    thresholds,
    allowMissingThrottle: input.allowMissingThrottle === true || input['allow-missing-throttle'] === true,
  };
}

function pushFlag(args, flag, value) {
  if (value === undefined || value === null || value === false) return;
  args.push(flag);
  if (value !== true) args.push(String(value));
}

function buildRemoteRunArgs(optionsInput = {}) {
  const options = normalizeValidationOptions(optionsInput);
  const args = ['run'];
  pushFlag(args, '--host', options.host);
  pushFlag(args, '--domains', options.domains.join(','));
  pushFlag(args, '--max-pages', options.maxPages);
  pushFlag(args, '--max-concurrent', options.maxConcurrent);
  pushFlag(args, '--interval', options.intervalSeconds);
  pushFlag(args, '--window', options.windowSeconds);
  pushFlag(args, '--limit', options.initialLimit);
  pushFlag(args, '--adaptive-limit', true);
  pushFlag(args, '--target-sync-ms', options.targetSyncMs);
  pushFlag(args, '--min-limit', options.minLimit);
  pushFlag(args, '--max-limit', options.maxLimit);
  pushFlag(args, '--include-content', true);
  pushFlag(args, '--include-links', true);
  pushFlag(args, '--prune-after-ingest', true);
  pushFlag(args, '--no-backoff', true);
  pushFlag(args, '--remote-storage-budget-mb', options.remoteStorageBudgetMb);
  pushFlag(args, '--remote-storage-reserve-mb', options.remoteStorageReserveMb);
  pushFlag(args, '--normal-concurrency', options.normalConcurrency);
  pushFlag(args, '--perf-summary-every', options.perfSummaryEvery);
  return args;
}

function buildDrainArgs(optionsInput = {}, remainingMs = null) {
  const options = normalizeValidationOptions(optionsInput);
  const intervalSeconds = Math.max(1, Math.min(3, options.intervalSeconds));
  const maxRoundsByTime = remainingMs && remainingMs > 0
    ? Math.max(1, Math.floor((remainingMs / 1000) / intervalSeconds))
    : options.drainRounds;
  const rounds = Math.max(1, Math.min(options.drainRounds, maxRoundsByTime));
  const args = ['sync'];
  pushFlag(args, '--host', options.host);
  pushFlag(args, '--rounds', rounds);
  pushFlag(args, '--interval', intervalSeconds);
  pushFlag(args, '--window', 30);
  pushFlag(args, '--limit', options.initialLimit);
  pushFlag(args, '--adaptive-limit', true);
  pushFlag(args, '--target-sync-ms', options.targetSyncMs);
  pushFlag(args, '--min-limit', options.minLimit);
  pushFlag(args, '--max-limit', options.maxLimit);
  pushFlag(args, '--include-content', true);
  pushFlag(args, '--include-links', true);
  pushFlag(args, '--prune-after-ingest', true);
  pushFlag(args, '--no-backoff', true);
  pushFlag(args, '--remote-storage-budget-mb', options.remoteStorageBudgetMb);
  pushFlag(args, '--remote-storage-reserve-mb', options.remoteStorageReserveMb);
  pushFlag(args, '--normal-concurrency', options.normalConcurrency);
  pushFlag(args, '--perf-summary-every', 1);
  return args;
}

function computeDeltas(before = {}, after = {}) {
  const beforeTotals = before.totals || {};
  const afterTotals = after.totals || {};
  const keys = ['urls', 'responses', 'successResponses', 'failedResponses', 'content'];
  const deltas = {};
  for (const key of keys) {
    deltas[key] = Math.max(0, toNumber(afterTotals[key], 0) - toNumber(beforeTotals[key], 0));
  }
  return deltas;
}

function summarizeLedgerState(ledger = {}) {
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const completedUrlIds = new Set();
  for (const entry of entries) {
    if (!entry.confirmedAt || !entry.prunedAt) continue;
    for (const id of entry.urlIds || []) completedUrlIds.add(Number(id));
  }
  const rawUnconfirmed = entries.filter(entry => !entry.confirmedAt);
  const supersededUnconfirmed = rawUnconfirmed.filter(entry => {
    const ids = (entry.urlIds || []).map(Number).filter(Number.isInteger);
    return ids.length > 0 && ids.every(id => completedUrlIds.has(id));
  });
  const unconfirmed = rawUnconfirmed.filter(entry => !supersededUnconfirmed.includes(entry));
  const unpruned = entries.filter(entry => entry.confirmedAt && !entry.prunedAt);
  const completed = entries.filter(entry => entry.confirmedAt && entry.prunedAt);
  return {
    entries: entries.length,
    unconfirmed: unconfirmed.length,
    rawUnconfirmed: rawUnconfirmed.length,
    supersededUnconfirmed: supersededUnconfirmed.length,
    unpruned: unpruned.length,
    completed: completed.length,
    lastWatermark: ledger.lastWatermark || null,
    totalPulled: toNumber(ledger.totalPulled, 0),
  };
}

function percentile(values, quantile) {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(quantile * (sorted.length - 1))));
  return sorted[index];
}

function parseRunLogMetrics(text = '') {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const roundSamples = [];
  const errorLines = [];
  const perfLines = [];
  for (const line of lines) {
    if (/perf p50\/p95/i.test(line)) perfLines.push(line.trim());
    if (/\b(error|failed|timeout|ECONN|HTTP\s+[45]\d\d)\b/i.test(line)) errorLines.push(line.trim());
    const match = line.match(/\[(\d+)] .*?(\d+) URLs, (\d+) content.*?fetch: (\d+)ms, ingest: (\d+)ms, round: (\d+)ms/i);
    if (match) {
      roundSamples.push({
        round: Number(match[1]),
        urls: Number(match[2]),
        content: Number(match[3]),
        fetchMs: Number(match[4]),
        ingestMs: Number(match[5]),
        roundMs: Number(match[6]),
      });
    }
  }
  return {
    lineCount: lines.length,
    errorLines: errorLines.slice(-25),
    perfLines: perfLines.slice(-25),
    roundSamples,
  };
}

function buildBenchmarkStats({ startedAt, finishedAt, deltas = {}, recent = {}, runLog = {} } = {}) {
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const finishMs = finishedAt ? Date.parse(finishedAt) : NaN;
  const elapsedMs = Number.isFinite(startMs) && Number.isFinite(finishMs) ? Math.max(0, finishMs - startMs) : 0;
  const elapsedSeconds = elapsedMs > 0 ? elapsedMs / 1000 : 0;
  const roundSamples = Array.isArray(runLog.roundSamples) ? runLog.roundSamples : [];
  return {
    elapsedMs,
    downloadsPerMinute: elapsedSeconds > 0 ? (toNumber(deltas.responses, 0) / elapsedSeconds) * 60 : 0,
    successPerMinute: elapsedSeconds > 0 ? (toNumber(deltas.successResponses, 0) / elapsedSeconds) * 60 : 0,
    contentPerMinute: elapsedSeconds > 0 ? (toNumber(deltas.content, 0) / elapsedSeconds) * 60 : 0,
    bytesPerMinute: elapsedSeconds > 0 ? (toNumber(recent.bytes, 0) / elapsedSeconds) * 60 : 0,
    roundSamples: roundSamples.length,
    fetchMs: {
      p50: percentile(roundSamples.map(sample => sample.fetchMs), 0.5),
      p95: percentile(roundSamples.map(sample => sample.fetchMs), 0.95),
    },
    ingestMs: {
      p50: percentile(roundSamples.map(sample => sample.ingestMs), 0.5),
      p95: percentile(roundSamples.map(sample => sample.ingestMs), 0.95),
    },
    roundMs: {
      p50: percentile(roundSamples.map(sample => sample.roundMs), 0.5),
      p95: percentile(roundSamples.map(sample => sample.roundMs), 0.95),
    },
  };
}

function validateEvidence({ options: optionsInput = {}, before = {}, after = {}, recent = {}, ledger = {}, remote = {}, timing = {}, child = {}, runLog = {} } = {}) {
  const options = normalizeValidationOptions(optionsInput);
  const thresholds = options.thresholds;
  const deltas = computeDeltas(before, after);
  const ledgerSummary = Array.isArray(ledger.entries) ? summarizeLedgerState(ledger) : ledger;
  const recentDownloads = toNumber(recent.downloads, 0);
  const recentSuccess = toNumber(recent.success, 0);
  const recentFailed = toNumber(recent.failed, 0);
  const failureRatio = recentDownloads > 0 ? recentFailed / recentDownloads : 1;
  const checks = [];

  function addCheck(name, ok, actual, expected, severity = 'error') {
    checks.push({ name, ok: Boolean(ok), actual, expected, severity });
  }

  addCheck('strict-time-limit', toNumber(timing.elapsedMs, 0) <= options.durationMs, toNumber(timing.elapsedMs, 0), `<= ${options.durationMs}ms`, 'fatal');
  addCheck('remote-health', remote.healthOk === true, remote.healthStatus || remote.healthError || 'unknown', 'healthy / reachable', 'fatal');
  addCheck('remote-throttle-endpoint', options.allowMissingThrottle || remote.throttleOk === true, remote.throttleStatus || remote.throttleError || 'unknown', 'HTTP 200 throttle endpoint', 'error');
  addCheck('new-responses', deltas.responses >= thresholds.minNewResponses, deltas.responses, `>= ${thresholds.minNewResponses}`);
  addCheck('successful-responses', Math.max(deltas.successResponses, recentSuccess) >= thresholds.minSuccessResponses, Math.max(deltas.successResponses, recentSuccess), `>= ${thresholds.minSuccessResponses}`);
  addCheck('content-rows', deltas.content >= thresholds.minContentRows, deltas.content, `>= ${thresholds.minContentRows}`);
  addCheck('host-spread', toNumber(recent.distinctHosts, 0) >= thresholds.minDistinctHosts, toNumber(recent.distinctHosts, 0), `>= ${thresholds.minDistinctHosts}`);
  addCheck('failure-ratio', failureRatio <= thresholds.maxFailureRatio, Number(failureRatio.toFixed(3)), `<= ${thresholds.maxFailureRatio}`);
  addCheck('ledger-unconfirmed', toNumber(ledgerSummary.unconfirmed, 0) <= thresholds.maxUnconfirmedLedgerEntries, toNumber(ledgerSummary.unconfirmed, 0), `<= ${thresholds.maxUnconfirmedLedgerEntries}`);
  addCheck('ledger-unpruned', toNumber(ledgerSummary.unpruned, 0) <= thresholds.maxUnprunedLedgerEntries, toNumber(ledgerSummary.unpruned, 0), `<= ${thresholds.maxUnprunedLedgerEntries}`);
  addCheck('child-exit', child.exitCode === 0 || child.stoppedAtDeadline === true, child.exitCode ?? child.signal ?? 'unknown', 'clean exit or deadline stop');
  addCheck('run-log-errors', (runLog.errorLines || []).length === 0, (runLog.errorLines || []).slice(0, 5), 'no error lines', 'warn');

  const blocking = checks.filter(check => !check.ok && check.severity !== 'warn');
  const diagnostics = checks
    .filter(check => !check.ok)
    .map(check => `${check.name}: expected ${check.expected}, got ${JSON.stringify(check.actual)}`);

  return {
    ok: blocking.length === 0,
    checks,
    diagnostics,
    deltas,
    ledger: ledgerSummary,
    benchmark: buildBenchmarkStats({
      startedAt: timing.startedAt,
      finishedAt: timing.finishedAt,
      deltas,
      recent,
      runLog,
    }),
  };
}

function createPlan(optionsInput = {}) {
  const options = normalizeValidationOptions(optionsInput);
  return {
    command: 'cloud-crawl-e2e',
    host: options.host,
    domains: options.domains,
    durationMs: options.durationMs,
    crawlBudgetMs: options.crawlBudgetMs,
    drainMs: options.drainMs,
    validationMs: options.validationMs,
    stopGraceMs: options.stopGraceMs,
    hardLimit: '15 minutes by default; total process phases must finish before durationMs',
    remoteRunArgs: buildRemoteRunArgs(options),
    drainArgs: buildDrainArgs(options, options.drainMs),
    thresholds: options.thresholds,
  };
}

module.exports = {
  DEFAULT_DOMAINS,
  DEFAULT_THRESHOLDS,
  DEFAULT_TIMING,
  normalizeValidationOptions,
  buildRemoteRunArgs,
  buildDrainArgs,
  computeDeltas,
  summarizeLedgerState,
  parseRunLogMetrics,
  buildBenchmarkStats,
  validateEvidence,
  createPlan,
};
