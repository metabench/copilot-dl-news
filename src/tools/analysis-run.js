#!/usr/bin/env node

// Orchestrated analysis runner.
// 1. Ensures page/domain analysis is up to date by invoking existing tools.
// 2. Awards milestone rows for domains that now satisfy analysis thresholds.

const path = require('path');
const { spawnSync } = require('child_process');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../ensure_db');
const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent
} = require('../ui/express/services/analysisRuns');
const { awardMilestones } = require('./milestones');
const { analysePages } = require('./analyse-pages-core');
let NewsDatabase;

function parseArgs(argv = []) {
  if (!Array.isArray(argv)) return {};
  const args = {};
  for (const raw of argv.slice(2)) {
    if (typeof raw !== 'string' || !raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    const keyPart = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
    if (!keyPart) continue;
    const key = toCamelCase(keyPart.trim());
    if (!key) continue;
    if (eq === -1) {
      args[key] = true;
    } else {
      const value = raw.slice(eq + 1);
      args[key] = coerceArgValue(value);
    }
  }
  return args;
}

function toCamelCase(text) {
  if (!text) return text;
  return text.replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
}

function coerceArgValue(value) {
  if (value === undefined) return undefined;
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) return numeric;
  }
  return value;
}

function boolArg(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function getOption(source, ...names) {
  if (!source) return undefined;
  for (const name of names) {
    if (name == null) continue;
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      return source[name];
    }
    const camel = toCamelCase(String(name));
    if (camel !== name && Object.prototype.hasOwnProperty.call(source, camel)) {
      return source[camel];
    }
  }
  return undefined;
}

function generateRunId(provided) {
  if (provided) return String(provided);
  const now = new Date();
  const iso = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `analysis-${iso}-${rand}`;
}

function logInfo(message, details) {
  if (details === undefined) {
    console.log(`[analysis-run] ${message}`);
    return;
  }
  try {
    console.log(`[analysis-run] ${message}`, details);
  } catch (_) {
    console.log(`[analysis-run] ${message}`);
  }
}

function createRunTracker(dbPath, runId, initialData, { verbose = false } = {}) {
  let db = null;
  try {
    db = ensureDb(dbPath);
    ensureAnalysisRunSchema(db);
    createAnalysisRun(db, {
      id: runId,
      startedAt: initialData?.startedAt,
      status: initialData?.status,
      stage: initialData?.stage,
      analysisVersion: initialData?.analysisVersion,
      pageLimit: initialData?.pageLimit,
      domainLimit: initialData?.domainLimit,
      skipPages: initialData?.skipPages,
      skipDomains: initialData?.skipDomains,
      dryRun: initialData?.dryRun,
      verbose: initialData?.verbose,
      summary: initialData?.summary,
      lastProgress: initialData?.lastProgress,
      error: initialData?.error
    });
  } catch (err) {
    if (db) {
      try {
        updateAnalysisRun(db, runId, {
          startedAt: initialData?.startedAt,
          status: initialData?.status,
          stage: initialData?.stage,
          analysisVersion: initialData?.analysisVersion,
          pageLimit: initialData?.pageLimit,
          domainLimit: initialData?.domainLimit,
          skipPages: initialData?.skipPages,
          skipDomains: initialData?.skipDomains,
          dryRun: initialData?.dryRun,
          verbose: initialData?.verbose,
          summary: initialData?.summary,
          lastProgress: initialData?.lastProgress,
          error: initialData?.error
        });
      } catch (updateErr) {
        if (verbose) console.warn(`[analysis-run] tracker init failed: ${updateErr.message || updateErr}`);
        try { db.close(); } catch (_) {}
        db = null;
      }
    } else if (verbose) {
      console.warn(`[analysis-run] tracker init failed: ${err.message || err}`);
    }
  }

  if (!db) {
    return {
      update() {},
      event() {},
      close() {}
    };
  }

  function safeExecute(fn) {
    if (!db) return;
    try {
      fn();
    } catch (err) {
      if (verbose) console.warn(`[analysis-run] tracker error: ${err.message || err}`);
    }
  }

  return {
    update(patch = {}) {
      if (!patch || !Object.keys(patch).length) return;
      safeExecute(() => updateAnalysisRun(db, runId, patch));
    },
    event(stage, message, details = null) {
      if (!stage && !message) return;
      safeExecute(() => addAnalysisRunEvent(db, { runId, stage, message, details }));
    },
    close() {
      if (!db) return;
      try { db.close(); } catch (_) {}
      db = null;
    }
  };
}

function createRollingRateLogger(label) {
  const samples = [];
  let timer = null;
  let lastLine = null;

  function prune(now) {
    while (samples.length > 1 && now - samples[0].ts > 2000) {
      samples.shift();
    }
  }

  function compute(now) {
    if (!samples.length) return { count: 0, total: 0 };
    const latest = samples[samples.length - 1];
    let baseline = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) {
      if (now - samples[i].ts >= 1000) {
        baseline = samples[i];
        break;
      }
    }
    let count = Math.max(0, latest.processed - baseline.processed);
    if (count === 0 && samples.length > 1) {
      const prev = samples[samples.length - 2];
      count = Math.max(0, latest.processed - prev.processed);
    }
    return { count, total: latest.processed };
  }

  function render(force = false) {
    const now = Date.now();
    prune(now);
    const { count, total } = compute(now);
    const line = `[analysis-run] ${label}: ${count} pages processed in last 1s (total ${total})`;
    if (!force && line === lastLine) return;
    process.stdout.write(`\r${line}`);
    lastLine = line;
  }

  return {
    record(total) {
      if (typeof total !== 'number' || !Number.isFinite(total)) return;
      const now = Date.now();
      samples.push({ ts: now, processed: total });
      prune(now);
      if (!timer) {
        timer = setInterval(() => render(false), 250);
      }
      render(true);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (lastLine != null) {
        process.stdout.write(`\r${lastLine}\n`);
        lastLine = null;
      }
      samples.length = 0;
    }
  };
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createProgressReporter({ label = 'Page analysis progress', logger = logInfo, logEveryCount = 500, logEveryMs = 5000 } = {}) {
  let lastLoggedCount = 0;
  let lastLoggedAt = 0;

  function shouldLog(processed, now) {
    if (processed <= lastLoggedCount) {
      return (now - lastLoggedAt) >= logEveryMs;
    }
    if ((processed - lastLoggedCount) >= logEveryCount) {
      return true;
    }
    return (now - lastLoggedAt) >= logEveryMs;
  }

  function logPayload(payload, force = false) {
    if (!payload) return;
    const processed = toNumber(payload.processed ?? payload.updated ?? payload.analysed ?? payload.count ?? 0, 0);
    const updated = toNumber(payload.updated ?? payload.processed ?? payload.analysed ?? payload.count ?? 0, 0);
    const now = Date.now();
    if (!force && !shouldLog(processed, now)) {
      return;
    }
    lastLoggedCount = processed;
    lastLoggedAt = now;
    try {
      logger(label, { processed, updated });
    } catch (_) {
      // ignore logging failures
    }
  }

  return {
    report(payload) {
      logPayload(payload, false);
    },
    flush(payload) {
      logPayload(payload, true);
    }
  };
}

function ensureDatabasePrepared(dbPath, { verbose = false } = {}) {
  if (!NewsDatabase) {
    NewsDatabase = require('../db');
  }
  const db = new NewsDatabase(dbPath);
  try {
    if (verbose) {
      console.log(`[analysis-run] database ensure: running schema migrations for ${dbPath}`);
    }
    if (db && db.db && typeof db.db.pragma === 'function') {
      try { db.db.pragma('optimize'); } catch (_) {}
    }
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function runAnalyzeDomains(scriptPath, opts) {
  const args = [`--db=${opts.db}`];
  if (opts.domainLimit != null) args.push(`--limit=${opts.domainLimit}`);
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit'
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`analyze-domains exited with status ${res.status}`);
  }
}

async function runAnalysis(rawOptions = {}) {
  const options = rawOptions || {};
  const projectRoot = findProjectRoot(__dirname);
  const dbPath = getOption(options, 'db', 'dbPath', 'databasePath') || path.join(projectRoot, 'data', 'news.db');

  const analysisVersionRaw = getOption(options, 'analysis-version', 'analysisVersion');
  const analysisVersion = analysisVersionRaw != null && analysisVersionRaw !== '' ? Number(analysisVersionRaw) : undefined;
  const safeAnalysisVersion = Number.isNaN(analysisVersion) ? undefined : analysisVersion;

  const limitRaw = getOption(options, 'limit', 'pageLimit');
  const limit = limitRaw != null && limitRaw !== '' ? Number(limitRaw) : undefined;
  const safeLimit = Number.isNaN(limit) ? undefined : limit;

  const domainLimitRaw = getOption(options, 'domain-limit', 'domainLimit');
  const domainLimit = domainLimitRaw != null && domainLimitRaw !== '' ? Number(domainLimitRaw) : undefined;
  const safeDomainLimit = Number.isNaN(domainLimit) ? undefined : domainLimit;

  const skipPages = boolArg(getOption(options, 'skip-pages', 'skipPages'), false);
  const skipDomains = boolArg(getOption(options, 'skip-domains', 'skipDomains'), false);
  const dryRun = boolArg(getOption(options, 'dry-run', 'dryRun'), false);
  const verbose = boolArg(getOption(options, 'verbose'), false);
  const progressLoggingEnabled = options.progressLogging !== false;
  const userProgressHandler = typeof options.onProgress === 'function' ? options.onProgress : null;

  const runId = generateRunId(getOption(options, 'run-id', 'runId'));
  const startedAtIso = new Date().toISOString();
  const runSummary = {
    runId,
    startedAt: startedAtIso,
    config: {
      dbPath,
      analysisVersion: safeAnalysisVersion ?? null,
      pageLimit: safeLimit ?? null,
      domainLimit: safeDomainLimit ?? null,
      skipPages,
      skipDomains,
      dryRun,
      verbose
    },
    steps: {}
  };
  const tracker = createRunTracker(dbPath, runId, {
    startedAt: startedAtIso,
    status: 'running',
    stage: 'starting',
    analysisVersion: safeAnalysisVersion,
    pageLimit: safeLimit,
    domainLimit: safeDomainLimit,
    skipPages,
    skipDomains,
    dryRun,
    verbose,
    summary: runSummary,
    lastProgress: { stage: 'starting' },
    details: runSummary.config
  }, { verbose });

  logInfo('Run starting', {
    runId,
    dbPath,
    analysisVersion: safeAnalysisVersion ?? null,
    pageLimit: safeLimit ?? null,
    domainLimit: safeDomainLimit ?? null,
    skipPages,
    skipDomains,
    dryRun,
    verbose
  });

  let awarded = [];
  try {
    tracker.update({ stage: 'db-setup', lastProgress: { stage: 'db-setup' } });
    tracker.event('db-setup', 'Ensuring primary database schema', { dbPath });
    logInfo('Ensuring primary database schema', { runId, dbPath });
    ensureDatabasePrepared(dbPath, { verbose });
    runSummary.steps.dbSetup = { ensured: true };
    tracker.update({ summary: runSummary, lastProgress: { stage: 'db-setup', ensured: true } });
    tracker.event('db-setup', 'Database schema ready', { dbPath });
    logInfo('Database schema ready', { runId, dbPath });

    if (!skipPages) {
      logInfo('Running page analysis', {
        runId,
        analysisVersion: safeAnalysisVersion ?? null,
        pageLimit: safeLimit ?? null
      });
      tracker.update({ stage: 'page-analysis', lastProgress: { stage: 'page-analysis' } });
      tracker.event('page-analysis', 'Starting page analysis', {
        analysisVersion: safeAnalysisVersion ?? null,
        limit: safeLimit ?? null
      });
      const progressLogger = createRollingRateLogger('analyse-pages');
      const progressReporter = progressLoggingEnabled
        ? createProgressReporter({
            label: 'Page analysis progress',
            logEveryCount: safeLimit && safeLimit > 0 ? Math.max(1, Math.floor(safeLimit / 20)) : 250,
            logEveryMs: 5000,
            logger: logInfo
          })
        : null;
      let summary = null;
      try {
        summary = await analysePages({
          dbPath,
          analysisVersion: safeAnalysisVersion ?? 1,
          limit: safeLimit,
          verbose,
          onProgress(payload) {
            const processedTotal = Number.isFinite(payload?.processed) ? payload.processed : null;
            const updatedTotal = Number.isFinite(payload?.updated) ? payload.updated : null;
            const total = updatedTotal != null && processedTotal != null
              ? Math.max(processedTotal, updatedTotal)
              : (processedTotal ?? updatedTotal);
            if (total != null) progressLogger.record(total);
            if (progressReporter) progressReporter.report(payload);
            if (userProgressHandler) {
              try { userProgressHandler(payload); } catch (_) {}
            }
          }
        });
      } finally {
        progressLogger.stop();
        if (progressReporter && summary) {
          const finalProcessed = Number(summary.processed ?? summary.analysed ?? safeLimit ?? 0);
          const finalUpdated = Number(summary.updated ?? summary.analysed ?? 0);
          progressReporter.flush({ processed: finalProcessed, updated: finalUpdated });
        }
      }
      const pageSummary = summary || { analysed: null, updated: null, placesInserted: null };
      runSummary.steps.pages = pageSummary;
      tracker.update({ summary: runSummary, lastProgress: { stage: 'page-analysis', summary: pageSummary } });
      tracker.event('page-analysis', 'Completed page analysis', { summary: pageSummary });
      if (summary && verbose) {
        console.log(`[analysis-run] analyse-pages summary: ${JSON.stringify(summary)}`);
      }
      logInfo('Page analysis completed', { runId, summary: pageSummary });
    } else {
      if (verbose) {
        console.log('[analysis-run] skipping page analysis');
      }
      logInfo('Skipping page analysis', { runId, reason: 'skip-pages flag' });
      runSummary.steps.pages = { skipped: true };
      tracker.event('page-analysis', 'Skipped page analysis', { reason: 'skip-pages flag' });
      tracker.update({
        summary: runSummary,
        stage: skipDomains ? 'awarding-milestones' : 'domain-analysis',
        lastProgress: { stage: 'page-analysis', skipped: true }
      });
    }

    if (!skipDomains) {
      logInfo('Running domain analysis', { runId, domainLimit: safeDomainLimit ?? null });
      tracker.update({ stage: 'domain-analysis', lastProgress: { stage: 'domain-analysis' } });
      tracker.event('domain-analysis', 'Starting domain analysis', { domainLimit: safeDomainLimit ?? null });
      runAnalyzeDomains(path.join(projectRoot, 'src', 'tools', 'analyze-domains.js'), {
        db: dbPath,
        domainLimit: safeDomainLimit
      });
      runSummary.steps.domains = { completed: true, limit: safeDomainLimit ?? null };
      tracker.update({ summary: runSummary, lastProgress: { stage: 'domain-analysis', completed: true } });
      tracker.event('domain-analysis', 'Completed domain analysis', { domainLimit: safeDomainLimit ?? null });
      logInfo('Domain analysis completed', { runId, domainLimit: safeDomainLimit ?? null });
    } else {
      if (verbose) {
        console.log('[analysis-run] skipping domain analysis');
      }
      logInfo('Skipping domain analysis', { runId, reason: 'skip-domains flag' });
      runSummary.steps.domains = { skipped: true };
      tracker.event('domain-analysis', 'Skipped domain analysis', { reason: 'skip-domains flag' });
      tracker.update({
        summary: runSummary,
        stage: 'awarding-milestones',
        lastProgress: { stage: 'domain-analysis', skipped: true }
      });
    }

    tracker.update({ stage: 'awarding-milestones', lastProgress: { stage: 'awarding-milestones' } });
    tracker.event('awarding-milestones', 'Awarding milestones', { dryRun });
    logInfo('Awarding milestones', { runId, dryRun });

    try { NewsDatabase = require('../db'); } catch (e) {
      console.error('Database unavailable:', e.message);
      tracker.event('failed', 'Database unavailable', { error: e.message });
      throw e;
    }

    const db = new NewsDatabase(dbPath);
    try {
      awarded = awardMilestones(db, { dryRun, verbose });
    } finally {
      try { db.close(); } catch (_) {}
    }

    runSummary.steps.milestones = {
      count: awarded.length,
      dryRun,
      awarded: awarded.map((m) => ({
        scope: m.scope,
        kind: m.kind,
        details: m.details
      }))
    };
    tracker.update({ summary: runSummary, lastProgress: { stage: 'awarding-milestones', count: awarded.length } });
    tracker.event('awarding-milestones', awarded.length ? 'Awarded milestones' : 'No new milestones to award', {
      count: awarded.length,
      dryRun,
      awarded: awarded.length ? awarded : undefined
    });
    logInfo('Milestone awarding complete', { runId, awardedCount: awarded.length, dryRun });

    const endedAtIso = new Date().toISOString();
    runSummary.endedAt = endedAtIso;
    const duration = Date.parse(endedAtIso) - Date.parse(startedAtIso);
    runSummary.durationMs = Number.isFinite(duration) ? duration : null;

    tracker.update({
      status: 'completed',
      stage: 'completed',
      endedAt: endedAtIso,
      summary: runSummary,
      lastProgress: { stage: 'completed', count: awarded.length }
    });
    tracker.event('completed', 'Analysis run completed', {
      count: awarded.length,
      durationMs: runSummary.durationMs
    });
    logInfo('Run completed', {
      runId,
      durationMs: runSummary.durationMs,
      awardedCount: awarded.length,
      dryRun
    });
  } catch (err) {
    const endedAtIso = new Date().toISOString();
    runSummary.endedAt = endedAtIso;
    runSummary.error = err && err.message ? err.message : String(err);
    const duration = Date.parse(endedAtIso) - Date.parse(startedAtIso);
    runSummary.durationMs = Number.isFinite(duration) ? duration : null;

    tracker.update({
      status: 'failed',
      stage: 'failed',
      endedAt: endedAtIso,
      error: runSummary.error,
      summary: runSummary,
      lastProgress: { stage: 'failed', error: runSummary.error }
    });
    tracker.event('failed', 'Analysis run failed', {
      error: runSummary.error
    });
    logInfo('Run failed', { runId, error: runSummary.error });
    tracker.close();
    throw err;
  } finally {
    tracker.close();
  }

  if (awarded.length) {
    const headline = dryRun ? 'Would award milestones' : 'Awarded milestones';
    for (const m of awarded) {
      logInfo(`${headline}: ${m.kind} @ ${m.scope}`, m.details);
    }
  } else {
    logInfo('No new milestones to award');
  }

  if (dryRun) {
    logInfo('Dry-run mode: no database changes were committed');
  }

  return runSummary;
}

async function cli(argv = process.argv) {
  const args = parseArgs(argv);
  return runAnalysis(args);
}

if (require.main === module) {
  cli().catch((err) => {
    console.error('[analysis-run] failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runAnalysis,
  cli,
  parseArgs,
  generateRunId
};
