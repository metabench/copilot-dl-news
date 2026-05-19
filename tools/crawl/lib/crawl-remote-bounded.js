'use strict';

function normalizeDomains(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(list.map(item => String(item).trim()).filter(Boolean))];
}

function resolveTargetDomains(args, statusData) {
  if (args.domain) return normalizeDomains([args.domain]);
  if (args.domains) return normalizeDomains(args.domains);
  return normalizeDomains((statusData?.domains || []).map(domain => domain.domain));
}

function summarizeBoundedRun(statusData, targetDomains) {
  const targets = normalizeDomains(targetDomains);
  const byDomain = new Map((statusData?.domains || []).map(domain => [domain.domain, domain]));
  const running = [];
  const completed = [];
  const notStarted = [];
  const unknown = [];

  for (const domain of targets) {
    const status = byDomain.get(domain);
    if (!status) {
      unknown.push({ domain, reason: 'missing' });
      continue;
    }

    const hasEverStarted = Boolean(
      status.startedAt ||
      status.stoppedAt ||
      status.isRunning ||
      status.state === 'running' ||
      status.stats?.fetched ||
      status.stats?.done ||
      status.stats?.stored ||
      status.stats?.errors
    );

    if (status.isRunning || status.state === 'running') {
      running.push(status);
      continue;
    }

    if (!hasEverStarted) {
      notStarted.push(status);
      continue;
    }

    completed.push(status);
  }

  return {
    targetDomains: targets,
    running,
    completed,
    notStarted,
    unknown,
    allDone: running.length === 0 && notStarted.length === 0 && unknown.length === 0,
  };
}

function findMissingDomains(statusData, targetDomains) {
  const configured = new Set((statusData?.domains || []).map(domain => domain.domain));
  return normalizeDomains(targetDomains).filter(domain => !configured.has(domain));
}

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function pickArg(args, names) {
  for (const name of names) {
    if (args && args[name] !== undefined) return args[name];
  }
  return undefined;
}

function normalizeCollectOptions(args = {}, targetDomains = []) {
  const domains = normalizeDomains(targetDomains);
  const targetPages = parsePositiveInt(pickArg(args, ['target-pages', 'targetPages']))
    || parsePositiveInt(pickArg(args, ['max-pages', 'maxPages']))
    || 100;
  const maxPages = parsePositiveInt(pickArg(args, ['max-pages', 'maxPages']))
    || Math.ceil(targetPages * 1.5);
  const requestedMinComplete = parsePositiveInt(pickArg(args, ['min-complete-hosts', 'minCompleteHosts']));
  const minCompleteHosts = domains.length > 0
    ? Math.min(requestedMinComplete || domains.length, domains.length)
    : (requestedMinComplete || 1);
  const drainEmptyRounds = parsePositiveInt(pickArg(args, ['drain-empty-rounds', 'drainEmptyRounds', 'empty-rounds', 'emptyRounds'])) || 3;

  // Graph-seed options: local brain explores link graph and pushes seeds to remote
  const seedFromGraphRaw = pickArg(args, ['seed-from-graph', 'seedFromGraph']);
  const seedFromGraph = seedFromGraphRaw === undefined ? true
    : seedFromGraphRaw === false || String(seedFromGraphRaw).toLowerCase() === 'false' ? false
    : true;
  const graphSeedLimit = parsePositiveInt(pickArg(args, ['graph-seed-limit', 'graphSeedLimit']))
    || targetPages * 2;

  // Sync mode: 'polling' (default) or 'streaming' (SSE push)
  const syncMode = String(pickArg(args, ['sync-mode', 'syncMode']) || 'polling').toLowerCase();
  const syncBatchSize = parsePositiveInt(pickArg(args, ['sync-batch-size', 'syncBatchSize'])) || 1;
  const syncBatchWindowMs = parsePositiveInt(pickArg(args, ['sync-batch-window-ms', 'syncBatchWindowMs'])) || 500;

  // min-new-pages: minimum genuinely new pages per host (stored after collect start, not just synced)
  const minNewPages = parsePositiveInt(pickArg(args, ['min-new-pages', 'minNewPages'])) || 0;

  // Telemetry verbosity options
  const verboseTelemetry = isTruthy(pickArg(args, ['verbose-telemetry', 'verboseTelemetry']));
  const showPageLatency = verboseTelemetry || isTruthy(pickArg(args, ['show-page-latency', 'showPageLatency']));
  const showPhaseTiming = verboseTelemetry || isTruthy(pickArg(args, ['show-phase-timing', 'showPhaseTiming']));
  const showPerHostStats = verboseTelemetry || isTruthy(pickArg(args, ['show-per-host-stats', 'showPerHostStats']));

  return {
    targetPages,
    maxPages,
    minCompleteHosts,
    minNewPages,
    intervalSec: parsePositiveInt(args.interval) || 5,
    windowSec: parsePositiveInt(args.window) || 10,
    limit: parsePositiveInt(args.limit) || 500,
    verifyEveryRounds: parsePositiveInt(pickArg(args, ['verify-every', 'verifyEvery'])) || 1,
    drainEmptyRounds,
    maxStatusFailures: parsePositiveInt(pickArg(args, ['max-status-failures', 'maxStatusFailures']))
      || Math.max(3, drainEmptyRounds + 1),
    startRetries: parsePositiveInt(pickArg(args, ['start-retries', 'startRetries'])) || 3,
    maxRounds: parsePositiveInt(args.rounds) || null,
    maxConcurrent: parsePositiveInt(pickArg(args, ['max-concurrent', 'maxConcurrent'])) || undefined,
    seedFromGraph,
    graphSeedLimit,
    syncMode,
    syncBatchSize,
    syncBatchWindowMs,
    showPageLatency,
    showPhaseTiming,
    showPerHostStats,
  };
}

function isTruthy(val) {
  if (val === undefined || val === null) return false;
  if (val === true) return true;
  if (val === false) return false;
  const s = String(val).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function summarizeHostVerification(rows, targetDomains, targetPages) {
  const targets = normalizeDomains(targetDomains);
  const byHost = new Map((rows || [])
    .filter(row => row && (row.host || row.domain))
    .map(row => [String(row.host || row.domain), {
      host: String(row.host || row.domain),
      pages: Number(row.pages || row.count || 0),
      lastFetched: row.lastFetched || row.last_fetched || null,
    }]));

  const complete = [];
  const incomplete = [];

  for (const host of targets) {
    const row = byHost.get(host) || { host, pages: 0, lastFetched: null };
    const item = {
      host,
      pages: Number(row.pages || 0),
      targetPages,
      needed: Math.max(0, targetPages - Number(row.pages || 0)),
      lastFetched: row.lastFetched || null,
    };
    if (item.pages >= targetPages) complete.push(item);
    else incomplete.push(item);
  }

  return {
    targetPages,
    totalHosts: targets.length,
    complete,
    incomplete,
    completeCount: complete.length,
    allComplete: targets.length > 0 && incomplete.length === 0,
  };
}

module.exports = {
  findMissingDomains,
  normalizeDomains,
  normalizeCollectOptions,
  resolveTargetDomains,
  summarizeHostVerification,
  summarizeBoundedRun,
};
