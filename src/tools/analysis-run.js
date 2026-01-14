#!/usr/bin/env node

// Orchestrated analysis runner.
// 1. Ensures page/domain analysis is up to date by invoking existing tools.
// 2. Awards milestone rows for domains that now satisfy analysis thresholds.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { is_array, tof, fp } = require('lang-tools');
const { CliFormatter } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');
const { findProjectRoot } = require('../shared/utils/project-root');
const { ensureDb } = require('../data/db/sqlite');
const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent
} = require('../deprecated-ui/express/services/analysisRuns');
const { awardMilestones } = require('./milestones');
const { analysePages } = require('./analyse-pages-core');
const { countArticlesNeedingAnalysis } = require('../data/db/queries/analysisQueries');
let NewsDatabase;

function createArgumentParser() {
  const projectRoot = findProjectRoot(__dirname);
  const defaultDbPath = path.join(projectRoot, 'data', 'news.db');
  const parser = new CliArgumentParser(
    'analysis-run',
    'Run page/domain analysis and award crawl milestones.'
  );

  parser
    .add('--db <path>', 'Path to news database (defaults to data/news.db)', defaultDbPath)
    .add('--analysis-version <number>', 'Override analysis version', undefined, 'int')
    .add('--limit <number>', 'Limit page analysis to N articles', undefined, 'int')
    .add('--domain-limit <number>', 'Limit domain analysis to N domains', undefined, 'int')
    .add('--run-id <id>', 'Provide a custom run identifier')
    .add('--skip-pages', 'Skip page analysis stage', false, 'boolean')
    .add('--skip-domains', 'Skip domain analysis stage', false, 'boolean')
    .add('--dry-run', 'Preview milestone awarding without writes', false, 'boolean')
    .add('--verbose', 'Enable verbose logging output', false, 'boolean')
    .add('--benchmark', 'Collect benchmark timings', false, 'boolean')
    .add('--piechart', 'Emit pie chart SVG for benchmark breakdown', false, 'boolean');

  const program = parser.getProgram();
  program.option('--no-progress-logging', 'Disable CLI progress logging');

  return parser;
}

let cachedParser = null;
function getParser() {
  if (!cachedParser) {
    cachedParser = createArgumentParser();
  }
  return cachedParser;
}

function parseArgs(argv = process.argv) {
  return getParser().parse(argv);
}

function toCamelCase(text) {
  if (!text) return text;
  return text.replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
}

/**
 * Polymorphic boolean coercion with fallback support.
 * Uses functional polymorphism (fp) from lang-tools for signature-based dispatch.
 * 
 * Signature handlers:
 * - '[b]' or '[b,b]': Boolean value returns as-is
 * - '[n]' or '[n,b]': Number converted to boolean (0 → false, non-zero → true)
 * - '[s]' or '[s,b]': String parsed (supports 'true', 't', 'yes', 'y', 'on', '1' for true)
 * - '[u]' or '[N]': undefined/null returns fallback
 */
const boolArg = fp((a, sig) => {
  const fallback = a.l >= 2 ? a[1] : false;
  
  // Handle undefined/null - return fallback
  if (sig === '[u]' || sig === '[N]' || sig === '[u,b]' || sig === '[N,b]') {
    return fallback;
  }
  
  // Boolean - return as-is
  if (sig === '[b]' || sig === '[b,b]') {
    return a[0];
  }
  
  // Number - truthy conversion
  if (sig === '[n]' || sig === '[n,b]') {
    return a[0] !== 0;
  }
  
  // String - parse common boolean representations
  if (sig === '[s]' || sig === '[s,b]') {
    const normalized = a[0].trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
    // Non-empty string not matching above patterns falls through to Boolean()
  }
  
  // Default: JavaScript Boolean() coercion
  return Boolean(a[0]);
});

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

function formatNumberIntl(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  try {
    return num.toLocaleString();
  } catch (_) {
    return String(num);
  }
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) {
    return 'n/a';
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts = [`${hours}h`];
  if (remainingMinutes) {
    parts.push(`${remainingMinutes}m`);
  }
  if (seconds) {
    parts.push(`${seconds}s`);
  }
  return parts.join(' ');
}

function buildRunHighlights(summary = {}) {
  const highlights = [];
  if (!summary || typeof summary !== 'object') return highlights;
  const steps = summary.steps && typeof summary.steps === 'object' ? summary.steps : {};
  const pages = steps.pages && typeof steps.pages === 'object' ? steps.pages : null;
  if (pages) {
    if (pages.skipped) {
      highlights.push('Page analysis skipped');
    } else {
      const updatedStr = formatNumberIntl(pages.updated);
      const processedStr = formatNumberIntl(pages.processed);
      if (updatedStr) {
        highlights.push(`${updatedStr} pages updated`);
      } else if (processedStr) {
        highlights.push(`${processedStr} pages analysed`);
      }
      if (Number(pages.placesInserted) > 0) {
        const placesStr = formatNumberIntl(pages.placesInserted) || String(pages.placesInserted);
        highlights.push(`${placesStr} places extracted`);
      }
      if (Number(pages.hubsInserted) > 0) {
        const hubsStr = formatNumberIntl(pages.hubsInserted) || String(pages.hubsInserted);
        highlights.push(`${hubsStr} new hubs detected`);
      }
      if (Number(pages.hubsUpdated) > 0) {
        const hubsUpdStr = formatNumberIntl(pages.hubsUpdated) || String(pages.hubsUpdated);
        highlights.push(`${hubsUpdStr} hubs refreshed`);
      }
    }
  }
  const domains = steps.domains && typeof steps.domains === 'object' ? steps.domains : null;
  if (domains) {
    if (domains.skipped) {
      highlights.push('Domain analysis skipped');
    } else if (domains.completed) {
      const limitStr = formatNumberIntl(domains.limit);
      highlights.push(`Domain analysis completed${limitStr ? ` (limit ${limitStr})` : ''}`);
    }
  }
  const milestones = steps.milestones && typeof steps.milestones === 'object' ? steps.milestones : null;
  if (milestones) {
    const awardedCount = Number(milestones.count);
    if (Number.isFinite(awardedCount) && awardedCount > 0) {
      const countStr = formatNumberIntl(awardedCount) || String(awardedCount);
      highlights.push(`${countStr} milestone${awardedCount === 1 ? '' : 's'} ${milestones.dryRun ? 'would be awarded' : 'awarded'}`);
    } else if (milestones.dryRun) {
      highlights.push('Dry-run: no database changes');
    }
  }
  if (is_array(summary.analysisHighlights)) {
    for (const entry of summary.analysisHighlights) {
      if (entry) highlights.push(String(entry));
    }
  }
  const unique = [];
  const seen = new Set();
  for (const item of highlights) {
    const key = tof(item) === 'string' ? item.trim().toLowerCase() : item;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(tof(item) === 'string' ? item : String(item));
    if (unique.length >= 5) break;
  }
  return unique;
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
    NewsDatabase = require('../data/db');
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

function generateBenchmarkPieChart(totalRunTimeMs, analysisCount, stageTimings) {
  if (!totalRunTimeMs || totalRunTimeMs <= 0) {
    console.log('[analysis-run] Pie chart skipped: no valid runtime');
    return '';
  }

  // Calculate unaccounted overhead
  const accountedTime = Object.values(stageTimings).reduce((a, b) => a + b, 0);
  const unaccountedMs = Math.max(0, totalRunTimeMs - accountedTime);

  // Create categories with percentages
  const categories = [
    { name: 'Database Setup', ms: stageTimings.dbSetup },
    { name: 'Page Analysis', ms: stageTimings.pageAnalysis },
    { name: 'Domain Analysis', ms: stageTimings.domainAnalysis },
    { name: 'Milestone Awarding', ms: stageTimings.milestones },
    { name: 'Other Measured', ms: stageTimings.other },
    { name: 'Unaccounted Overhead', ms: unaccountedMs }
  ].filter(c => c.ms > 0);

  // Sort by time descending for better visualization
  categories.sort((a, b) => b.ms - a.ms);

  // Colors for pie slices
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#C7CEEA'];

  // Calculate SVG pie chart
  const radius = 150;
  const centerX = 200;
  const centerY = 200;
  let currentAngle = -Math.PI / 2;
  const slices = [];
  const legendItems = [];

  categories.forEach((cat, idx) => {
    const percentage = (cat.ms / totalRunTimeMs) * 100;
    const sliceAngle = (cat.ms / totalRunTimeMs) * Math.PI * 2;
    const x1 = centerX + radius * Math.cos(currentAngle);
    const y1 = centerY + radius * Math.sin(currentAngle);
    const nextAngle = currentAngle + sliceAngle;
    const x2 = centerX + radius * Math.cos(nextAngle);
    const y2 = centerY + radius * Math.sin(nextAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const pathData = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slices.push(`<path d="${pathData}" fill="${colors[idx % colors.length]}" stroke="white" stroke-width="2"/>`);

    // Label for slice (if large enough)
    if (percentage >= 5) {
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelRadius = radius * 0.65;
      const labelX = centerX + labelRadius * Math.cos(labelAngle);
      const labelY = centerY + labelRadius * Math.sin(labelAngle);
      slices.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="bold" fill="white">${percentage.toFixed(1)}%</text>`);
    }

    legendItems.push({
      color: colors[idx % colors.length],
      name: cat.name,
      ms: cat.ms,
      percentage
    });

    currentAngle = nextAngle;
  });

  // Generate legend
  let legendY = 50;
  const legendSvg = legendItems.map((item, idx) => {
    const y = legendY + idx * 30;
    return `
      <g>
        <rect x="420" y="${y - 10}" width="15" height="15" fill="${item.color}" stroke="black" stroke-width="1"/>
        <text x="445" y="${y + 2}" font-size="13" font-family="monospace">${item.name}: ${item.ms}ms (${item.percentage.toFixed(1)}%)</text>
      </g>
    `;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg" style="background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; }
  </style>
  
  <text x="400" y="30" font-size="20" font-weight="bold" text-anchor="middle">Analysis Run Performance Breakdown</text>
  <text x="400" y="50" font-size="14" text-anchor="middle" fill="#666">Total time: ${(totalRunTimeMs / 1000).toFixed(2)}s across ${analysisCount} analyses (${(totalRunTimeMs / analysisCount).toFixed(0)}ms per-analysis avg)</text>
  
  <g>
    ${slices.join('\n    ')}
  </g>
  
  <text x="420" y="35" font-size="14" font-weight="bold">Breakdown:</text>
  ${legendSvg}
  
  <text x="420" y="480" font-size="11" fill="#999">Note: "Unaccounted Overhead" represents time not captured by individual stage timers</text>
</svg>`;

  return svg;
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
  const benchmark = boolArg(getOption(options, 'benchmark'), false);
  const piechart = boolArg(getOption(options, 'piechart'), false);
  const progressLoggingEnabled = options.progressLogging !== false;
  const userProgressHandler = typeof options.onProgress === 'function' ? options.onProgress : null;

  // Determine analysis version - if not specified, auto-increment to force re-analysis
  let effectiveAnalysisVersion = safeAnalysisVersion;
  if (!effectiveAnalysisVersion) {
    try {
      if (!NewsDatabase) {
        NewsDatabase = require('../data/db');
      }
      const tempDb = new NewsDatabase(dbPath);
      try {
        const maxVersionResult = tempDb.db.prepare(`SELECT COALESCE(MAX(analysis_version), 0) as max_version FROM content_analysis`).get();
        const maxVersion = Number(maxVersionResult?.max_version || 0);
        effectiveAnalysisVersion = maxVersion + 1;
        if (verbose) {
          console.log(`[analysis-run] Auto-incremented analysis version: ${effectiveAnalysisVersion} (was max: ${maxVersion})`);
        }
      } finally {
        tempDb.close();
      }
    } catch (err) {
      // If we can't determine version, default to 1 and warn
      effectiveAnalysisVersion = 1;
      logInfo('Could not determine max analysis version, using default 1', { error: err?.message });
    }
  }

  const runId = generateRunId(getOption(options, 'run-id', 'runId'));
  const startedAtIso = new Date().toISOString();
  const runSummary = {
    runId,
    startedAt: startedAtIso,
    config: {
      dbPath,
      analysisVersion: effectiveAnalysisVersion ?? null,
      pageLimit: safeLimit ?? null,
      domainLimit: safeDomainLimit ?? null,
      skipPages,
      skipDomains,
      dryRun,
      verbose
    },
    steps: {}
  };

  // Stage timing tracking for benchmark/piechart
  const stageTimings = {
    dbSetup: 0,
    pageAnalysis: 0,
    domainAnalysis: 0,
    milestones: 0,
    other: 0
  };
  let stageStartTime = {};

  const recordStageTime = (stageName, durationMs) => {
    if (stageName in stageTimings) {
      stageTimings[stageName] += durationMs;
    } else if (stageName) {
      stageTimings.other += durationMs;
    }
  };

  const startStageTimer = (stageName) => {
    stageStartTime[stageName] = Date.now();
  };

  const endStageTimer = (stageName) => {
    if (stageStartTime[stageName]) {
      const duration = Date.now() - stageStartTime[stageName];
      recordStageTime(stageName, duration);
      delete stageStartTime[stageName];
      return duration;
    }
    return 0;
  };

  const diagnosticsState = {
    currentStage: 'starting',
    lastCompletedStage: null,
    failure: null,
    timeline: []
  };

  const cloneDiagnostics = () => {
    const limit = 25;
    const timeline = Array.isArray(diagnosticsState.timeline)
      ? diagnosticsState.timeline.slice(-limit)
      : [];
    const base = {
      currentStage: diagnosticsState.currentStage || null,
      lastCompletedStage: diagnosticsState.lastCompletedStage || null,
      failure: diagnosticsState.failure || null,
      timeline
    };
    return JSON.parse(JSON.stringify(base));
  };

  const applyDiagnostics = () => {
    runSummary.diagnostics = cloneDiagnostics();
  };

  const pushTimelineEntry = (stage, status, details) => {
    const entry = {
      stage: stage || 'unknown',
      status,
      ts: new Date().toISOString()
    };
    if (details && Object.keys(details).length) {
      try {
        entry.details = JSON.parse(JSON.stringify(details));
      } catch (_) {
        entry.details = details;
      }
    }
    diagnosticsState.timeline.push(entry);
    if (diagnosticsState.timeline.length > 60) {
      diagnosticsState.timeline.splice(0, diagnosticsState.timeline.length - 60);
    }
    applyDiagnostics();
  };

  const beginStage = (stage, details) => {
    startStageTimer(stage);
    diagnosticsState.currentStage = stage || null;
    pushTimelineEntry(stage, 'started', details);
  };

  const completeStage = (stage, details) => {
    endStageTimer(stage);
    diagnosticsState.lastCompletedStage = stage || diagnosticsState.lastCompletedStage;
    if (diagnosticsState.currentStage === stage) {
      diagnosticsState.currentStage = null;
    }
    pushTimelineEntry(stage, 'completed', details);
  };

  const skipStage = (stage, details) => {
    if (diagnosticsState.currentStage === stage) {
      diagnosticsState.currentStage = null;
    }
    pushTimelineEntry(stage, 'skipped', details);
  };

  const failStage = (stage, err) => {
    const message = err?.message || String(err);
    const stack = typeof err?.stack === 'string'
      ? err.stack.split('\n').slice(0, 12).join('\n')
      : null;
    diagnosticsState.failure = {
      stage: stage || diagnosticsState.currentStage || 'unknown',
      message,
      stack,
      ts: new Date().toISOString()
    };
    pushTimelineEntry(diagnosticsState.failure.stage, 'failed', {
      message,
      stack
    });
  };

  applyDiagnostics();
  const progressSink = typeof options.progressSink === 'function' ? options.progressSink : null;
  const progressState = {
    runId,
    stage: 'starting',
    status: 'starting',
    summary: 'Analysis run starting…',
    config: runSummary.config,
    progress: null,
    signals: []
  };
  let lastProgressEmitAt = 0;
  let pendingProgressPatch = null;
  let pendingProgressTimer = null;
  const pushProgress = (payload) => {
    if (!payload) return;
    if (progressSink) {
      try { progressSink(payload); } catch (_) {}
    }
    try {
      process.stdout.write(`ANALYSIS_PROGRESS ${JSON.stringify(payload)}\n`);
    } catch (_) {}
  };
  const emitProgress = (patch = {}, { throttleMs = 0 } = {}) => {
    if (!patch || typeof patch !== 'object') patch = {};
    const now = Date.now();
    const ms = Number.isFinite(throttleMs) ? throttleMs : 0;
    if (ms > 0 && now - lastProgressEmitAt < ms) {
      pendingProgressPatch = pendingProgressPatch ? { ...pendingProgressPatch, ...patch } : { ...patch };
      if (patch.progress && pendingProgressPatch.progress) {
        pendingProgressPatch.progress = { ...pendingProgressPatch.progress, ...patch.progress };
      }
      if (!pendingProgressTimer) {
        pendingProgressTimer = setTimeout(() => {
          const pending = pendingProgressPatch;
          pendingProgressPatch = null;
          pendingProgressTimer = null;
          emitProgress(pending || {}, { throttleMs: 0 });
        }, ms);
        try { pendingProgressTimer.unref?.(); } catch (_) {}
      }
      return;
    }
    if (pendingProgressTimer) {
      try { clearTimeout(pendingProgressTimer); } catch (_) {}
      pendingProgressTimer = null;
      pendingProgressPatch = null;
    }
    lastProgressEmitAt = now;
    const payload = {
      ...progressState,
      ...patch,
      runId,
      ts: new Date().toISOString()
    };
    if (patch.progress) {
      payload.progress = { ...(progressState.progress || {}), ...patch.progress };
    } else if (progressState.progress) {
      payload.progress = { ...progressState.progress };
    }
    if (runSummary.diagnostics) {
      try {
        payload.diagnostics = JSON.parse(JSON.stringify(runSummary.diagnostics));
      } catch (_) {
        payload.diagnostics = runSummary.diagnostics;
      }
      progressState.diagnostics = payload.diagnostics;
    }
    if (is_array(payload.analysisHighlights)) {
      progressState.analysisHighlights = payload.analysisHighlights.slice();
    }
    if (is_array(payload.signals)) {
      progressState.signals = payload.signals.slice();
    }
    if (payload.stage) progressState.stage = payload.stage;
    if (payload.status) progressState.status = payload.status;
    if (payload.summary) progressState.summary = payload.summary;
    if (payload.progress) progressState.progress = { ...payload.progress };
    pushProgress(payload);
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
  lastProgress: { stage: 'starting', diagnostics: runSummary.diagnostics },
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

  emitProgress({ stage: 'starting', status: 'starting', summary: 'Analysis run starting…' });

  let awarded = [];
  try {
  beginStage('db-setup', { dbPath });
  tracker.update({ stage: 'db-setup', lastProgress: { stage: 'db-setup', diagnostics: runSummary.diagnostics } });
    tracker.event('db-setup', 'Ensuring primary database schema', { dbPath });
    logInfo('Ensuring primary database schema', { runId, dbPath });
  emitProgress({ stage: 'db-setup', status: 'running', summary: 'Preparing database schema…' });
    ensureDatabasePrepared(dbPath, { verbose });
    runSummary.steps.dbSetup = { ensured: true };
  completeStage('db-setup', { ensured: true });
  tracker.update({ summary: runSummary, lastProgress: { stage: 'db-setup', ensured: true, diagnostics: runSummary.diagnostics } });
    tracker.event('db-setup', 'Database schema ready', { dbPath });
    logInfo('Database schema ready', { runId, dbPath });
  emitProgress({ stage: 'db-setup', status: 'completed', summary: 'Database schema ready.' });

    if (!skipPages) {
      logInfo('Running page analysis', {
        runId,
        analysisVersion: safeAnalysisVersion ?? null,
        pageLimit: safeLimit ?? null
      });
      
      // Count total articles needing analysis for progress tracking
      let totalToAnalyze = 0;
      try {
        if (!NewsDatabase) {
          NewsDatabase = require('../data/db');
        }
        const tempDb = new NewsDatabase(dbPath);
        try {
          totalToAnalyze = countArticlesNeedingAnalysis(tempDb.db, safeAnalysisVersion ?? 1);
          // Apply limit if specified
          if (safeLimit && totalToAnalyze > safeLimit) {
            totalToAnalyze = safeLimit;
          }
        } finally {
          tempDb.close();
        }
      } catch (countErr) {
        logInfo('Could not count articles for progress tracking', { error: countErr?.message || String(countErr) });
      }
      
      beginStage('page-analysis', {
        analysisVersion: effectiveAnalysisVersion ?? null,
        limit: safeLimit ?? null,
        totalToAnalyze: totalToAnalyze || null
      });
      tracker.update({ stage: 'page-analysis', lastProgress: { stage: 'page-analysis', diagnostics: runSummary.diagnostics } });
      tracker.event('page-analysis', 'Starting page analysis', {
        analysisVersion: effectiveAnalysisVersion ?? null,
        limit: safeLimit ?? null,
        totalToAnalyze
      });
      emitProgress({
        stage: 'page-analysis',
        status: 'running',
        summary: totalToAnalyze > 0 
          ? `Page analysis running (${totalToAnalyze} articles to process)…` 
          : 'Page analysis running…',
        progress: { processed: 0, updated: 0, total: totalToAnalyze },
        total: totalToAnalyze
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
          analysisVersion: effectiveAnalysisVersion,
          limit: safeLimit,
          verbose,
          logger: console,
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
            
            // Calculate percentage if total is known
            let percentage = null;
            if (totalToAnalyze > 0 && processedTotal != null) {
              percentage = Math.min(100, Math.round((processedTotal / totalToAnalyze) * 100));
            }
            
            emitProgress({
              stage: 'page-analysis',
              status: 'running',
              progress: {
                processed: processedTotal != null ? processedTotal : undefined,
                updated: updatedTotal != null ? updatedTotal : undefined,
                total: totalToAnalyze > 0 ? totalToAnalyze : undefined,
                percentage: percentage != null ? percentage : undefined
              },
              summary: totalToAnalyze > 0 && processedTotal != null
                ? `Analyzing articles: ${processedTotal}/${totalToAnalyze} (${percentage}%)`
                : undefined
            }, { throttleMs: 600 });
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
  const pageSummary = summary || { analysed: null, updated: null, placesInserted: null, hubsInserted: null, hubsUpdated: null };
      runSummary.steps.pages = pageSummary;
  completeStage('page-analysis', pageSummary);
  tracker.update({ summary: runSummary, lastProgress: { stage: 'page-analysis', summary: pageSummary, diagnostics: runSummary.diagnostics } });
      tracker.event('page-analysis', 'Completed page analysis', { summary: pageSummary });
      if (summary && verbose) {
        console.log(`[analysis-run] analyse-pages summary: ${JSON.stringify(summary)}`);
      }
      logInfo('Page analysis completed', { runId, summary: pageSummary });
      const pageHighlights = buildRunHighlights({ steps: { pages: pageSummary } });
      const processedCount = Number(pageSummary.processed ?? pageSummary.analysed ?? safeLimit ?? 0);
      const updatedCount = Number(pageSummary.updated ?? processedCount ?? 0);
      const summaryParts = [];
      if (Number.isFinite(updatedCount) && updatedCount > 0) {
        const updatedStr = formatNumberIntl(updatedCount) || String(updatedCount);
        summaryParts.push(`${updatedStr} updated`);
      } else if (Number.isFinite(processedCount) && processedCount > 0) {
        const processedStr = formatNumberIntl(processedCount) || String(processedCount);
        summaryParts.push(`${processedStr} analysed`);
      }
      if (Number.isFinite(Number(pageSummary.placesInserted)) && Number(pageSummary.placesInserted) > 0) {
        const placesStr = formatNumberIntl(pageSummary.placesInserted) || String(pageSummary.placesInserted);
        summaryParts.push(`${placesStr} places extracted`);
      }
      if (Number.isFinite(Number(pageSummary.hubsInserted)) && Number(pageSummary.hubsInserted) > 0) {
        const hubsStr = formatNumberIntl(pageSummary.hubsInserted) || String(pageSummary.hubsInserted);
        summaryParts.push(`${hubsStr} new hubs`);
      }
      if (Number.isFinite(Number(pageSummary.hubsUpdated)) && Number(pageSummary.hubsUpdated) > 0) {
        const hubsUpdStr = formatNumberIntl(pageSummary.hubsUpdated) || String(pageSummary.hubsUpdated);
        summaryParts.push(`${hubsUpdStr} hubs updated`);
      }
      emitProgress({
        stage: 'page-analysis',
        status: 'completed',
        summary: summaryParts.length ? `Page analysis completed (${summaryParts.join(', ')})` : 'Page analysis completed.',
        progress: {
          processed: Number.isFinite(processedCount) ? processedCount : undefined,
          updated: Number.isFinite(updatedCount) ? updatedCount : undefined
        },
        analysisHighlights: pageHighlights,
        signals: pageHighlights,
        details: { pageSummary }
      });
    } else {
      if (verbose) {
        console.log('[analysis-run] skipping page analysis');
      }
      logInfo('Skipping page analysis', { runId, reason: 'skip-pages flag' });
      runSummary.steps.pages = { skipped: true };
      skipStage('page-analysis', { reason: 'skip-pages flag' });
      tracker.event('page-analysis', 'Skipped page analysis', { reason: 'skip-pages flag' });
      tracker.update({
        summary: runSummary,
        stage: skipDomains ? 'awarding-milestones' : 'domain-analysis',
        lastProgress: { stage: 'page-analysis', skipped: true, diagnostics: runSummary.diagnostics }
      });
      emitProgress({
        stage: 'page-analysis',
        status: 'skipped',
        summary: 'Page analysis skipped (skip-pages flag).',
        analysisHighlights: ['Page analysis skipped'],
        signals: ['Page analysis skipped']
      });
    }

    if (!skipDomains) {
      logInfo('Running domain analysis', { runId, domainLimit: safeDomainLimit ?? null });
      beginStage('domain-analysis', { domainLimit: safeDomainLimit ?? null });
      tracker.update({ stage: 'domain-analysis', lastProgress: { stage: 'domain-analysis', diagnostics: runSummary.diagnostics } });
      tracker.event('domain-analysis', 'Starting domain analysis', { domainLimit: safeDomainLimit ?? null });
      emitProgress({
        stage: 'domain-analysis',
        status: 'running',
        summary: 'Domain analysis running…'
      });
      runAnalyzeDomains(path.join(projectRoot, 'src', 'tools', 'analyze-domains.js'), {
        db: dbPath,
        domainLimit: safeDomainLimit
      });
      runSummary.steps.domains = { completed: true, limit: safeDomainLimit ?? null };
  completeStage('domain-analysis', { completed: true, limit: safeDomainLimit ?? null });
  tracker.update({ summary: runSummary, lastProgress: { stage: 'domain-analysis', completed: true, diagnostics: runSummary.diagnostics } });
      tracker.event('domain-analysis', 'Completed domain analysis', { domainLimit: safeDomainLimit ?? null });
      logInfo('Domain analysis completed', { runId, domainLimit: safeDomainLimit ?? null });
      const domainHighlights = buildRunHighlights({ steps: { domains: runSummary.steps.domains } });
      emitProgress({
        stage: 'domain-analysis',
        status: 'completed',
        summary: safeDomainLimit != null
          ? `Domain analysis completed (limit ${formatNumberIntl(safeDomainLimit) || safeDomainLimit}).`
          : 'Domain analysis completed.',
        analysisHighlights: domainHighlights,
        signals: domainHighlights,
        details: { domainSummary: runSummary.steps.domains }
      });
    } else {
      if (verbose) {
        console.log('[analysis-run] skipping domain analysis');
      }
      logInfo('Skipping domain analysis', { runId, reason: 'skip-domains flag' });
      runSummary.steps.domains = { skipped: true };
      skipStage('domain-analysis', { reason: 'skip-domains flag' });
      tracker.event('domain-analysis', 'Skipped domain analysis', { reason: 'skip-domains flag' });
      tracker.update({
        summary: runSummary,
        stage: 'awarding-milestones',
        lastProgress: { stage: 'domain-analysis', skipped: true, diagnostics: runSummary.diagnostics }
      });
      emitProgress({
        stage: 'domain-analysis',
        status: 'skipped',
        summary: 'Domain analysis skipped (skip-domains flag).',
        analysisHighlights: ['Domain analysis skipped'],
        signals: ['Domain analysis skipped']
      });
    }

  beginStage('awarding-milestones', { dryRun });
  tracker.update({ stage: 'awarding-milestones', lastProgress: { stage: 'awarding-milestones', diagnostics: runSummary.diagnostics } });
    tracker.event('awarding-milestones', 'Awarding milestones', { dryRun });
    logInfo('Awarding milestones', { runId, dryRun });
  emitProgress({ stage: 'awarding-milestones', status: 'running', summary: 'Awarding milestones…' });

    try { NewsDatabase = require('../data/db'); } catch (e) {
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
  completeStage('awarding-milestones', { count: awarded.length, dryRun });
  tracker.update({ summary: runSummary, lastProgress: { stage: 'awarding-milestones', count: awarded.length, diagnostics: runSummary.diagnostics } });
    tracker.event('awarding-milestones', awarded.length ? 'Awarded milestones' : 'No new milestones to award', {
      count: awarded.length,
      dryRun,
      awarded: awarded.length ? awarded : undefined
    });
    logInfo('Milestone awarding complete', { runId, awardedCount: awarded.length, dryRun });
    const milestoneHighlights = buildRunHighlights({ steps: { milestones: runSummary.steps.milestones } });
    emitProgress({
      stage: 'awarding-milestones',
      status: 'completed',
      summary: awarded.length
        ? `Milestones ${dryRun ? 'would be awarded' : 'awarded'} (${formatNumberIntl(awarded.length) || awarded.length}).`
        : 'No new milestones to award.',
      analysisHighlights: milestoneHighlights,
      signals: milestoneHighlights,
      details: { milestones: runSummary.steps.milestones }
    });

    const endedAtIso = new Date().toISOString();
    runSummary.endedAt = endedAtIso;
    const duration = Date.parse(endedAtIso) - Date.parse(startedAtIso);
    runSummary.durationMs = Number.isFinite(duration) ? duration : null;

    const runHighlights = buildRunHighlights(runSummary);
    runSummary.analysisHighlights = runHighlights;
    pushTimelineEntry('run', 'completed', {
      awardedCount: awarded.length,
      durationMs: runSummary.durationMs ?? null
    });
    tracker.update({
      status: 'completed',
      stage: 'completed',
      endedAt: endedAtIso,
      summary: runSummary,
      lastProgress: { stage: 'completed', count: awarded.length, diagnostics: runSummary.diagnostics }
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
    emitProgress({
      stage: 'completed',
      status: 'completed',
      summary: awarded.length
        ? `Analysis completed — ${formatNumberIntl(awarded.length) || awarded.length} milestone${awarded.length === 1 ? '' : 's'} ${dryRun ? 'would be' : ''} awarded.`
        : 'Analysis completed.',
      analysisHighlights: runHighlights,
      signals: runHighlights,
      details: { runSummary }
    });
  } catch (err) {
    const endedAtIso = new Date().toISOString();
    runSummary.endedAt = endedAtIso;
    runSummary.error = err && err.message ? err.message : String(err);
    const duration = Date.parse(endedAtIso) - Date.parse(startedAtIso);
    runSummary.durationMs = Number.isFinite(duration) ? duration : null;
    const failureStage = diagnosticsState.currentStage || progressState.stage || 'unknown';
    failStage(failureStage, err);
    pushTimelineEntry('run', 'failed', {
      stage: failureStage,
      message: runSummary.error
    });

    tracker.update({
      status: 'failed',
      stage: 'failed',
      endedAt: endedAtIso,
      error: runSummary.error,
      summary: runSummary,
      lastProgress: { stage: 'failed', error: runSummary.error, diagnostics: runSummary.diagnostics }
    });
    tracker.event('failed', 'Analysis run failed', {
      error: runSummary.error,
      stage: failureStage
    });
    logInfo('Run failed', { runId, error: runSummary.error });
    emitProgress({
      stage: 'failed',
      status: 'failed',
      summary: `Analysis run failed: ${runSummary.error}`,
      details: { error: runSummary.error, runSummary }
    });
    tracker.close();
    throw err;
  } finally {
    if (pendingProgressTimer) {
      try { clearTimeout(pendingProgressTimer); } catch (_) {}
      pendingProgressTimer = null;
      pendingProgressPatch = null;
    }
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

  // Generate pie chart if requested
  if (piechart && runSummary.durationMs) {
    try {
      const analysisCount = runSummary.steps.pages?.processed || 1;
      const svg = generateBenchmarkPieChart(runSummary.durationMs, analysisCount, stageTimings);
      if (svg) {
        const piechartPath = path.join(projectRoot, 'analysis-benchmark-piechart.svg');
        fs.writeFileSync(piechartPath, svg, 'utf8');
        logInfo('Pie chart generated', { path: piechartPath, duration: runSummary.durationMs, analysisCount, stagingTimings: stageTimings });
        console.log(`[analysis-run] Pie chart written to ${piechartPath}`);
      }
    } catch (err) {
      logInfo('Failed to generate pie chart', { error: err?.message });
    }
  }

  return runSummary;
}

function buildStageRows(summary = {}) {
  const steps = summary.steps || {};
  const rows = [];

  const dbSetup = steps.dbSetup || {};
  rows.push({
    Stage: 'DB setup',
    Status: dbSetup.ensured ? 'completed' : 'skipped',
    Details: dbSetup.ensured ? 'Schema ensured' : 'Skipped (used existing schema)'
  });

  const pages = steps.pages || {};
  const pagesSkipped = pages.skipped === true;
  const pagesStatus = pagesSkipped ? 'skipped' : 'completed';
  const processed = formatNumberIntl(pages.processed ?? pages.analysed);
  const updated = formatNumberIntl(pages.updated);
  const places = formatNumberIntl(pages.placesInserted);
  const hubsNew = formatNumberIntl(pages.hubsInserted);
  const hubsUpdated = formatNumberIntl(pages.hubsUpdated);
  const pageDetails = pagesSkipped
    ? 'skip-pages flag set'
    : [
        processed ? `${processed} processed` : null,
        updated ? `${updated} updated` : null,
        places ? `${places} places` : null,
        hubsNew ? `${hubsNew} hubs` : null,
        hubsUpdated ? `${hubsUpdated} hubs refreshed` : null
      ].filter(Boolean).join(', ') || 'Completed';
  rows.push({ Stage: 'Page analysis', Status: pagesStatus, Details: pageDetails });

  const domains = steps.domains || {};
  const domainsSkipped = domains.skipped === true;
  const domainsStatus = domainsSkipped ? 'skipped' : domains.completed ? 'completed' : 'pending';
  const domainLimitStr = formatNumberIntl(domains.limit);
  const domainDetails = domainsSkipped
    ? 'skip-domains flag set'
    : domains.completed
      ? domainLimitStr ? `Completed (limit ${domainLimitStr})` : 'Completed'
      : 'Not executed';
  rows.push({ Stage: 'Domain analysis', Status: domainsStatus, Details: domainDetails });

  const milestones = steps.milestones || {};
  const milestoneCount = Number(milestones.count || 0);
  const milestonesStatus = milestones.dryRun
    ? milestoneCount > 0 ? 'dry-run' : 'dry-run (none)'
    : milestoneCount > 0 ? 'awarded' : 'none';
  const milestoneDetails = milestoneCount > 0
    ? `${formatNumberIntl(milestoneCount) || milestoneCount} ${milestones.dryRun ? 'would be awarded (dry-run)' : 'awarded'}`
    : milestones.dryRun
      ? 'Dry-run, no awards'
      : 'No new milestones';
  rows.push({ Stage: 'Milestones', Status: milestonesStatus, Details: milestoneDetails });

  return rows;
}

function colorizeStatus(fmt, status) {
  const normalized = typeof status === 'string' ? status.toLowerCase() : '';
  switch (normalized) {
    case 'completed':
    case 'awarded':
      return fmt.COLORS.success(status);
    case 'dry-run':
    case 'dry-run (none)':
      return fmt.COLORS.info(status);
    case 'none':
      return fmt.COLORS.muted(status);
    case 'skipped':
      return fmt.COLORS.warning(status);
    case 'pending':
      return fmt.COLORS.accent(status);
    default:
      return status;
  }
}

function emitCliSummary(fmt, summary) {
  if (!fmt || !summary || typeof summary !== 'object') return;
  const config = summary.config || {};
  const highlights = buildRunHighlights(summary);
  const rows = buildStageRows(summary);
  const milestoneCount = Number(summary.steps?.milestones?.count || 0);

  fmt.header('analysis-run summary');
  fmt.summary({
    'Run ID': summary.runId || '(auto)',
    'Duration': formatDuration(summary.durationMs),
    'Milestones': milestoneCount ? formatNumberIntl(milestoneCount) : '0',
    'Dry run': config.dryRun ? 'Yes' : 'No'
  });

  fmt.section('Configuration');
  fmt.stat('Database', config.dbPath || '(default)');
  fmt.stat('Analysis version', config.analysisVersion != null ? config.analysisVersion : 'auto');
  fmt.stat('Page limit', config.pageLimit != null ? formatNumberIntl(config.pageLimit) : 'all');
  fmt.stat('Domain limit', config.domainLimit != null ? formatNumberIntl(config.domainLimit) : 'all');
  fmt.stat('Verbose logging', config.verbose ? 'Enabled' : 'Disabled');
  fmt.stat('Benchmark mode', summary.steps?.benchmark ? 'Enabled' : (config.benchmark ? 'Requested' : 'Off'));

  if (Array.isArray(rows) && rows.length) {
    fmt.section('Stages');
    fmt.table(rows, {
      columns: ['Stage', 'Status', 'Details'],
      format: {
        Status: (value) => colorizeStatus(fmt, value)
      }
    });
  }

  if (highlights.length) {
    fmt.list('Highlights', highlights);
  }

  fmt.footer();
}

async function cli(argv = process.argv) {
  const fmt = new CliFormatter();
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    fmt.error(error?.message || 'Failed to parse arguments');
    throw error;
  }

  try {
    const summary = await runAnalysis(args);
    emitCliSummary(fmt, summary);
    return summary;
  } catch (error) {
    fmt.error(`Analysis run failed: ${error?.message || error}`);
    throw error;
  }
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
