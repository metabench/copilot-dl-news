'use strict';

const fs = require('fs');
const path = require('path');

const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
const downloadEvidence = require('../../../src/data/db/queries/downloadEvidence');

const SCHEMA_VERSION = 1;
const DEFAULT_WINDOW_MINUTES = 60;
const DEFAULT_SAMPLE_LIMIT = 10;
const HARD_MAX_HOSTS = 25;
const HARD_MAX_SAMPLE_LIMIT = 50;
const HARD_MAX_WINDOW_MINUTES = 24 * 60;
const MAX_EVIDENCE_BYTES = 64 * 1024;
const MAX_COMMAND_LENGTH = 500;
const MAX_URL_LENGTH = 240;
const HARD_MAX_LOCAL_SMOKE_PAGES = 3;
const HARD_MAX_LOCAL_SMOKE_DEPTH = 1;
const DEFAULT_LOCAL_SMOKE_HOST = 'bbc.com';
const DEFAULT_LOCAL_SMOKE_UI_HOST = '127.0.0.1';
const DEFAULT_LOCAL_SMOKE_UI_PORT = 3171;
const DEFAULT_LOCAL_SMOKE_WATCH_TIMEOUT_SEC = 180;
const DEFAULT_LOCAL_SMOKE_LAUNCH_TIMEOUT_SEC = 180;
const DEFAULT_LOCAL_SMOKE_NO_OUTPUT_TIMEOUT_SEC = 90;
const DEFAULT_SLOW_DB_EVIDENCE_MS = 5000;
const HARD_MAX_QUERY_TIMINGS = 12;
const HARD_MAX_COMPARISON_REPORTS = 8;
const HARD_MAX_COMPARISON_WARNINGS = 16;
const HARD_MAX_COMPARISON_DIAGNOSTICS = 12;

function normalizePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseHosts(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set();
  const hosts = [];
  for (const item of input) {
    const normalized = String(item || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    hosts.push(normalized);
  }
  if (hosts.length > HARD_MAX_HOSTS) {
    throw new Error(`at most ${HARD_MAX_HOSTS} hosts can be monitored in one small-crawl report`);
  }
  return hosts;
}

function parseDate(value, label) {
  if (!value) return null;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = value instanceof Date ? value : new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date/time`);
  }
  return date;
}

function toIso(date) {
  return date.toISOString();
}

function normalizeOptions(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const generatedDate = parseDate(generatedAt, 'generatedAt') || new Date();
  const windowMinutes = normalizePositiveInt(
    options.windowMinutes || options.windowMin,
    DEFAULT_WINDOW_MINUTES,
    HARD_MAX_WINDOW_MINUTES
  );
  const untilDate = parseDate(options.until || options.finishedAt, 'until') || generatedDate;
  const sinceDate = parseDate(options.since || options.startedAt, 'since')
    || new Date(untilDate.getTime() - windowMinutes * 60 * 1000);

  if (sinceDate.getTime() > untilDate.getTime()) {
    throw new Error('since must be before until');
  }

  return {
    generatedAt: toIso(generatedDate),
    since: toIso(sinceDate),
    until: toIso(untilDate),
    windowMinutes,
    hosts: parseHosts(options.hosts || options.domains || options.domain),
    sampleLimit: normalizePositiveInt(options.sampleLimit || options.limit, DEFAULT_SAMPLE_LIMIT, HARD_MAX_SAMPLE_LIMIT),
    expectedMinDownloads: Math.max(0, Number.parseInt(options.expectedMinDownloads || 0, 10) || 0),
    command: normalizeCommand(options.command),
    profile: options.profile ? String(options.profile) : null,
    dbPath: options.dbPath || options.db || path.resolve(process.cwd(), 'data', 'news.db'),
  };
}

function normalizeCommand(command) {
  if (!command) return null;
  const text = String(command).trim();
  if (!text) return null;
  return text.length > MAX_COMMAND_LENGTH ? `${text.slice(0, MAX_COMMAND_LENGTH - 3)}...` : text;
}

function defaultLocalSmokeUrl(generatedAt) {
  void generatedAt;
  return 'https://www.bbc.com/news';
}

function hostFromUrl(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function normalizeBoundedInt(value, fallback, min, max, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeLocalSmokeOptions(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const url = String(options.url || defaultLocalSmokeUrl(generatedAt)).trim();
  const urlHost = hostFromUrl(url);
  if (!/^https?:\/\//i.test(url) || !urlHost) {
    throw new Error('local smoke --url must be an http(s) URL');
  }

  const explicitHosts = parseHosts(options.hosts || options.domain || options.host || urlHost);
  if (explicitHosts.length !== 1) {
    throw new Error('local smoke requires exactly one host');
  }
  if (!hostMatches(urlHost, explicitHosts[0])) {
    throw new Error(`local smoke URL host ${urlHost} does not match requested host ${explicitHosts[0]}`);
  }

  const maxPages = normalizeBoundedInt(
    options.maxPages || options['max-pages'],
    1,
    1,
    HARD_MAX_LOCAL_SMOKE_PAGES,
    'local smoke max pages'
  );
  const maxDepth = normalizeBoundedInt(
    options.maxDepth || options['max-depth'],
    0,
    0,
    HARD_MAX_LOCAL_SMOKE_DEPTH,
    'local smoke max depth'
  );
  const watchTimeoutSec = normalizeBoundedInt(
    options.watchTimeoutSec || options['watch-timeout'],
    DEFAULT_LOCAL_SMOKE_WATCH_TIMEOUT_SEC,
    30,
    600,
    'local smoke watch timeout'
  );
  const launchTimeoutSec = normalizeBoundedInt(
    options.launchTimeoutSec || options['launch-timeout'],
    DEFAULT_LOCAL_SMOKE_LAUNCH_TIMEOUT_SEC,
    30,
    600,
    'local smoke launch timeout'
  );
  const noOutputTimeoutSec = normalizeBoundedInt(
    options.noOutputTimeoutSec || options['no-output-timeout'],
    DEFAULT_LOCAL_SMOKE_NO_OUTPUT_TIMEOUT_SEC,
    30,
    300,
    'local smoke no-output timeout'
  );
  const uiPort = normalizeBoundedInt(
    options.uiPort || options['ui-port'],
    DEFAULT_LOCAL_SMOKE_UI_PORT,
    1024,
    65535,
    'local smoke UI port'
  );
  const uiHost = String(options.uiHost || options['ui-host'] || DEFAULT_LOCAL_SMOKE_UI_HOST).trim();

  return {
    generatedAt: toIso(parseDate(generatedAt, 'generatedAt')),
    url,
    host: explicitHosts[0],
    maxPages,
    maxDepth,
    watchTimeoutSec,
    launchTimeoutSec,
    noOutputTimeoutSec,
    uiHost,
    uiPort,
    expectedMinDownloads: Math.max(1, Number.parseInt(options.expectedMinDownloads || options['expected-min-downloads'] || 1, 10) || 1),
    expectedMinHosts: Math.max(1, Number.parseInt(options.expectedMinHosts || options['expected-min-hosts'] || 1, 10) || 1),
    sampleLimit: normalizePositiveInt(options.sampleLimit || options.limit, DEFAULT_SAMPLE_LIMIT, HARD_MAX_SAMPLE_LIMIT),
    dbPath: options.dbPath || options.db || path.resolve(process.cwd(), 'data', 'news.db'),
  };
}

function buildLocalSmokeCommand(options = {}) {
  const normalized = normalizeLocalSmokeOptions(options);
  const args = [
    'tools/crawl/run.js',
    '--local',
    '--profile', 'gentle',
    '--max-pages', String(normalized.maxPages),
    '--max-depth', String(normalized.maxDepth),
    '--concurrency', '1',
    '--batch-retries', '0',
    '--batch-request-timeout-ms', '60000',
    '--per-domain-interval-ms', '1000',
    '--override', 'preferCache=false',
    '--override', 'maxAgeMs=0',
    '--override', 'useSitemap=false',
    '--override', 'sitemapOnly=false',
    '--override', 'skipQueryUrls=false',
    '--watch',
    '--watch-interval', '2000',
    '--watch-timeout', String(normalized.watchTimeoutSec),
    '--watch-min-fetches', String(normalized.expectedMinDownloads),
    '--watch-min-hosts', String(normalized.expectedMinHosts),
    '--launch-timeout', String(normalized.launchTimeoutSec),
    '--no-output-timeout', String(normalized.noOutputTimeoutSec),
    '--auto-stop',
    '--no-meter',
    '--json',
    '--db', normalized.dbPath,
    '--ui-host', normalized.uiHost,
    '--ui-port', String(normalized.uiPort),
    normalized.url,
  ];
  return {
    executable: 'node',
    args,
    display: `node ${args.map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(' ')}`,
  };
}

function buildLocalSmokePlan(options = {}) {
  const normalized = normalizeLocalSmokeOptions(options);
  const command = buildLocalSmokeCommand(normalized);
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'monitored-small-crawl-local-smoke-plan',
    generatedAt: normalized.generatedAt,
    target: {
      url: truncateUrl(normalized.url),
      host: normalized.host,
    },
    caps: {
      maxPages: normalized.maxPages,
      maxDepth: normalized.maxDepth,
      concurrency: 1,
      watchTimeoutSec: normalized.watchTimeoutSec,
      launchTimeoutSec: normalized.launchTimeoutSec,
      noOutputTimeoutSec: normalized.noOutputTimeoutSec,
      uiHost: normalized.uiHost,
      uiPort: normalized.uiPort,
      expectedMinHosts: normalized.expectedMinHosts,
    },
    command: {
      executable: command.executable,
      args: command.args,
      display: command.display,
      expectedMinDownloads: normalized.expectedMinDownloads,
      expectedMinHosts: normalized.expectedMinHosts,
    },
    verification: {
      baseline: 'collect before crawl',
      verify: 'collect after crawl using the exact command window',
      recentOverview: 'review monitored-small-crawl recent and Cloud Crawl dashboard',
    },
    actionPolicy: {
      planOnlyByDefault: true,
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      writesLocalDbWhenExecuted: true,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      forceDeploys: false,
      changesCollectBehavior: false,
    },
    nextSafestAction: 'run again with --execute only when a bounded local DB write is intended',
  };
}

function clipText(text, maxLength = 1200) {
  const raw = String(text || '');
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 3)}...` : raw;
}

function clipTextTail(text, maxLength = 1200) {
  const raw = String(text || '');
  return raw.length > maxLength ? `...${raw.slice(raw.length - maxLength + 3)}` : raw;
}

function parseJsonIfPossible(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function parseLastJsonLineWithKey(text, key) {
  const lines = String(text || '').split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.includes(`"${key}"`)) continue;
    const parsed = parseJsonIfPossible(trimmed);
    if (parsed && parsed[key]) return parsed[key];
  }
  return null;
}

function extractLaunchJobs(stdoutJson) {
  const results = Array.isArray(stdoutJson?.results) ? stdoutJson.results : [];
  return results
    .map((result) => {
      const job = result?.body?.job || null;
      if (!job) return null;
      return {
        id: job.id || result.jobId || null,
        operationName: job.operationName || null,
        startUrl: truncateUrl(job.startUrl || result.startUrl || null),
        status: job.status || 'unknown',
        startedAt: job.startedAt || null,
        finishedAt: job.finishedAt || null,
        abortRequested: Boolean(job.abortRequested),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeWatchJobs(watchFinal) {
  const jobs = watchFinal?.jobs;
  if (!jobs || typeof jobs !== 'object') return null;
  const counts = jobs.counts && typeof jobs.counts === 'object' ? jobs.counts : {};
  const items = Array.isArray(jobs.items) ? jobs.items : [];
  return {
    counts: {
      total: Math.max(0, Number(counts.total || 0) || 0),
      running: Math.max(0, Number(counts.running || 0) || 0),
      completed: Math.max(0, Number(counts.completed || 0) || 0),
      failed: Math.max(0, Number(counts.failed || 0) || 0),
      terminal: Math.max(0, Number(counts.terminal || 0) || 0),
      statuses: counts.statuses && typeof counts.statuses === 'object' ? counts.statuses : {},
    },
    items: items.slice(0, 5).map((job) => ({
      id: job.id || null,
      operationName: job.operationName || null,
      status: job.status || 'unknown',
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
      abortRequested: Boolean(job.abortRequested),
    })),
  };
}

function buildLocalSmokeRunReport({ plan, baseline, crawlResult, verification }) {
  const hasChildExitCode = crawlResult?.exitCode !== null && crawlResult?.exitCode !== undefined;
  const childExitCode = hasChildExitCode ? Number(crawlResult.exitCode) : null;
  const childOk = childExitCode === 0 && !crawlResult?.timedOut && !crawlResult?.error;
  const stdoutJson = parseJsonIfPossible(crawlResult?.stdout);
  const watchFinal = parseLastJsonLineWithKey(crawlResult?.stderr, 'watchFinal');
  const verificationBlockers = Array.isArray(verification?.blockers) ? verification.blockers : [];
  const blockers = [];
  if (!childOk) blockers.push('crawl-command-failed');
  blockers.push(...verificationBlockers);
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'monitored-small-crawl-local-smoke-result',
    generatedAt: new Date().toISOString(),
    target: plan.target,
    caps: plan.caps,
    actionPolicy: {
      startsCrawler: true,
      startsLocalCrawler: true,
      contactsRemote: false,
      writesLocalDbExpected: true,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      forceDeploys: false,
      changesCollectBehavior: false,
    },
    command: plan.command,
    crawl: {
      startedAt: crawlResult?.startedAt || null,
      finishedAt: crawlResult?.finishedAt || null,
      exitCode: childExitCode,
      signal: crawlResult?.signal || null,
      timedOut: Boolean(crawlResult?.timedOut),
      error: crawlResult?.error || null,
      stdoutPreview: clipText(crawlResult?.stdout),
      stderrPreview: clipText(crawlResult?.stderr),
      stdoutTail: clipTextTail(crawlResult?.stdout),
      stderrTail: clipTextTail(crawlResult?.stderr),
      stdoutJson,
      launchJobs: extractLaunchJobs(stdoutJson),
      watchFinal,
      watchJobs: normalizeWatchJobs(watchFinal),
    },
    baseline: baseline ? {
      generatedAt: baseline.generatedAt,
      database: baseline.database,
      hosts: baseline.hosts,
    } : null,
    verification,
    readinessLabel: blockers.length ? 'verification-blocked' : verification?.readinessLabel || 'verified-new-data',
    blockers,
    warnings: Array.isArray(verification?.warnings) ? verification.warnings : [],
    nextSafestAction: blockers.length
      ? 'inspect-crawl-output-and-db-evidence-before-running-another-small-crawl'
      : 'review-dashboard-recent-downloads-before-broadening-crawl-scope',
  };
}

function hostMatches(host, requested) {
  const normalized = String(host || '').toLowerCase();
  const target = String(requested || '').toLowerCase();
  return normalized === target || normalized.endsWith(`.${target}`);
}

function anyHostMatches(host, requestedHosts = []) {
  if (!requestedHosts.length) return true;
  return requestedHosts.some(target => hostMatches(host, target));
}

function truncateUrl(url) {
  const text = String(url || '');
  return text.length > MAX_URL_LENGTH ? `${text.slice(0, MAX_URL_LENGTH - 3)}...` : text;
}

function normalizeSampleRows(rows = [], options = {}) {
  const hosts = Array.isArray(options.hosts) ? options.hosts : [];
  const sinceMs = parseDate(options.since, 'since')?.getTime();
  const untilMs = parseDate(options.until, 'until')?.getTime();
  const limit = normalizePositiveInt(options.sampleLimit, DEFAULT_SAMPLE_LIMIT, HARD_MAX_SAMPLE_LIMIT);
  const samples = [];
  const seen = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const host = row.host || hostFromUrl(row.url);
    if (!anyHostMatches(host, hosts)) continue;
    const fetchedAt = row.fetched_at || row.fetchedAt || null;
    const fetchedMs = fetchedAt ? parseDate(fetchedAt, 'fetchedAt')?.getTime() : null;
    if (Number.isFinite(sinceMs) && Number.isFinite(fetchedMs) && fetchedMs < sinceMs) continue;
    if (Number.isFinite(untilMs) && Number.isFinite(fetchedMs) && fetchedMs > untilMs) continue;
    const sampleKey = `${row.url || ''}|${fetchedAt || ''}`;
    if (seen.has(sampleKey)) continue;
    seen.add(sampleKey);

    samples.push({
      host,
      url: truncateUrl(row.url),
      httpStatus: Number(row.http_status ?? row.httpStatus ?? 0) || null,
      bytesDownloaded: Number(row.bytes_downloaded ?? row.bytesDownloaded ?? 0) || 0,
      fetchedAt,
      contentType: row.content_type || row.contentType || null,
    });

    if (samples.length >= limit) break;
  }

  return samples;
}

function getTotals(snapshot) {
  return snapshot && snapshot.totals ? snapshot.totals : {};
}

function buildDelta(before, after) {
  const a = getTotals(after);
  const b = getTotals(before);
  return {
    urls: Math.max(0, Number(a.urls || 0) - Number(b.urls || 0)),
    responses: Math.max(0, Number(a.responses || 0) - Number(b.responses || 0)),
    successResponses: Math.max(0, Number(a.successResponses || 0) - Number(b.successResponses || 0)),
    failedResponses: Math.max(0, Number(a.failedResponses || 0) - Number(b.failedResponses || 0)),
    content: Math.max(0, Number(a.content || 0) - Number(b.content || 0)),
  };
}

function normalizeQueryTimings(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, HARD_MAX_QUERY_TIMINGS)
    .map((row) => ({
      name: String(row.name || 'unknown').slice(0, 80),
      ms: Math.max(0, Number(row.ms || 0) || 0),
    }));
}

function sumQueryTimingMs(rows = []) {
  return normalizeQueryTimings(rows).reduce((sum, row) => sum + row.ms, 0);
}

function timedDbEvidenceStep(name, timings, fn) {
  const startedAt = Date.now();
  try {
    return fn();
  } finally {
    timings.push({
      name,
      ms: Date.now() - startedAt,
    });
  }
}

function uniqueBounded(values = [], limit = HARD_MAX_COMPARISON_WARNINGS) {
  const seen = new Set();
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeModeReport(report) {
  if (!report || typeof report !== 'object') return null;
  if (report.mode === 'monitored-small-crawl-local-smoke-result') {
    return report.verification && typeof report.verification === 'object'
      ? report.verification
      : null;
  }
  return report;
}

function reportNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function reportDeltaValue(delta, key) {
  return delta && typeof delta === 'object' ? reportNumber(delta[key]) : 0;
}

function summarizeMonitoredSmallCrawlReport(report, options = {}) {
  const evidenceReport = normalizeModeReport(report);
  if (!evidenceReport || evidenceReport.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('monitored report must have schemaVersion 1');
  }
  if (!String(evidenceReport.mode || '').startsWith('monitored-small-crawl-')) {
    throw new Error(`unsupported monitored report mode: ${evidenceReport.mode || 'unknown'}`);
  }

  const recent = evidenceReport.recent || {};
  const database = evidenceReport.database || {};
  const delta = database.delta || null;
  const queryTimings = normalizeQueryTimings(evidenceReport.evidence?.queryTimings || []);
  const slowQueryWarningMs = reportNumber(evidenceReport.evidence?.slowQueryWarningMs) || DEFAULT_SLOW_DB_EVIDENCE_MS;
  const slowQuerySteps = queryTimings.filter(row => row.ms > slowQueryWarningMs);
  const sampleRows = Array.isArray(recent.samples) ? recent.samples : [];
  const blockers = uniqueBounded([
    ...(Array.isArray(report.blockers) ? report.blockers : []),
    ...(Array.isArray(evidenceReport.blockers) ? evidenceReport.blockers : []),
  ]);
  const warnings = uniqueBounded([
    ...(Array.isArray(report.warnings) ? report.warnings : []),
    ...(Array.isArray(evidenceReport.warnings) ? evidenceReport.warnings : []),
  ]);
  const crawl = report.mode === 'monitored-small-crawl-local-smoke-result'
    ? (report.crawl || {})
    : null;
  const command = report.command || evidenceReport.command || {};
  const requestedHosts = evidenceReport.hosts && Array.isArray(evidenceReport.hosts.requested)
    ? evidenceReport.hosts.requested
    : [];
  const latestFetchedAt = database.post?.latestFetchedAt
    || sampleRows.map(row => row.fetchedAt).filter(Boolean).sort().pop()
    || null;

  return {
    sourcePath: options.sourcePath ? path.resolve(options.sourcePath) : null,
    label: options.label || null,
    mode: report.mode || evidenceReport.mode,
    generatedAt: report.generatedAt || evidenceReport.generatedAt || null,
    verificationGeneratedAt: evidenceReport.generatedAt || null,
    readinessLabel: report.readinessLabel || evidenceReport.readinessLabel || 'unknown',
    target: report.target || null,
    hosts: {
      requested: requestedHosts.slice(0, HARD_MAX_HOSTS),
      missingRecentEvidence: Array.isArray(evidenceReport.hosts?.missingRecentEvidence)
        ? evidenceReport.hosts.missingRecentEvidence.slice(0, HARD_MAX_HOSTS)
        : [],
    },
    command: {
      profile: command.profile || null,
      expectedMinDownloads: reportNumber(command.expectedMinDownloads),
      command: normalizeCommand(command.command || command.display || null),
    },
    crawl: crawl ? {
      exitCode: crawl.exitCode ?? null,
      timedOut: Boolean(crawl.timedOut),
      error: crawl.error || null,
      startedAt: crawl.startedAt || null,
      finishedAt: crawl.finishedAt || null,
      watchFinal: crawl.watchFinal || null,
      launchJobs: Array.isArray(crawl.launchJobs) ? crawl.launchJobs.slice(0, 5) : [],
      watchJobs: crawl.watchJobs || crawl.watchFinal?.jobs || null,
    } : null,
    database: {
      path: database.path || null,
      latestFetchedAt,
      delta: delta ? {
        urls: reportDeltaValue(delta, 'urls'),
        responses: reportDeltaValue(delta, 'responses'),
        successResponses: reportDeltaValue(delta, 'successResponses'),
        failedResponses: reportDeltaValue(delta, 'failedResponses'),
        content: reportDeltaValue(delta, 'content'),
      } : null,
    },
    recent: {
      downloads: reportNumber(recent.downloads),
      success: reportNumber(recent.success),
      failed: reportNumber(recent.failed),
      bytes: reportNumber(recent.bytes),
      distinctHosts: reportNumber(recent.distinctHosts),
      sampleCount: sampleRows.length,
      latestSampleAt: sampleRows.map(row => row.fetchedAt).filter(Boolean).sort().pop() || null,
    },
    timings: {
      stepCount: queryTimings.length,
      totalMs: sumQueryTimingMs(queryTimings),
      maxMs: queryTimings.reduce((max, row) => Math.max(max, row.ms), 0),
      slowQueryWarningMs,
      slowSteps: slowQuerySteps.slice(0, HARD_MAX_COMPARISON_DIAGNOSTICS),
    },
    blockers,
    warnings,
  };
}

function evaluateStablePassEvidence(summary) {
  const satisfied = [];
  const missing = [];
  const expectedMin = reportNumber(summary.command?.expectedMinDownloads);
  const successDelta = reportDeltaValue(summary.database?.delta, 'successResponses');
  const contentDelta = reportDeltaValue(summary.database?.delta, 'content');
  const recentSuccess = reportNumber(summary.recent?.success);
  const recentDownloads = reportNumber(summary.recent?.downloads);

  if (summary.readinessLabel && summary.readinessLabel !== 'verification-blocked') {
    satisfied.push('latest-readiness-not-blocked');
  } else {
    missing.push('latest-readiness-not-blocked');
  }

  if (!summary.crawl || (summary.crawl.exitCode === 0 && !summary.crawl.timedOut && !summary.crawl.error)) {
    satisfied.push('crawl-command-exited-cleanly');
  } else {
    missing.push('crawl-command-exited-cleanly');
  }

  if (successDelta > 0 || contentDelta > 0 || recentSuccess > 0 || recentDownloads > 0) {
    satisfied.push('db-persistence-or-recent-download-evidence');
  } else {
    missing.push('db-persistence-or-recent-download-evidence');
  }

  if (expectedMin <= 0 || recentSuccess >= expectedMin || successDelta >= expectedMin) {
    satisfied.push('expected-download-threshold-met');
  } else {
    missing.push('expected-download-threshold-met');
  }

  if (!summary.timings?.slowSteps?.length) {
    satisfied.push('db-evidence-under-slow-threshold');
  } else {
    missing.push('db-evidence-under-slow-threshold');
  }

  if (summary.recent?.sampleCount > 0 || recentDownloads === 0) {
    satisfied.push('bounded-sample-evidence-present-or-not-needed');
  } else {
    missing.push('bounded-sample-evidence-present-or-not-needed');
  }

  return {
    passed: missing.length === 0,
    satisfied,
    missing,
  };
}

function buildComparisonDiagnostics(summaries) {
  const diagnostics = [];
  if (!summaries.length) return diagnostics;
  const latest = summaries[summaries.length - 1];
  const previous = summaries.length > 1 ? summaries[summaries.length - 2] : null;
  const latestSuccessDelta = reportDeltaValue(latest.database?.delta, 'successResponses');
  const latestContentDelta = reportDeltaValue(latest.database?.delta, 'content');
  const latestResponseDelta = reportDeltaValue(latest.database?.delta, 'responses');
  const latestUrlDelta = reportDeltaValue(latest.database?.delta, 'urls');

  if (latest.readinessLabel === 'verification-blocked') diagnostics.push('latest-report-verification-blocked');
  if (latest.recent.downloads === 0 && latestSuccessDelta === 0 && latestContentDelta === 0) {
    diagnostics.push('latest-report-has-no-new-data-evidence');
  }
  if (latestUrlDelta > 0 && latestResponseDelta === 0 && latestSuccessDelta === 0 && latestContentDelta === 0) {
    diagnostics.push('latest-report-url-only-db-delta');
  }
  if (latest.crawl && latest.recent.downloads === 0 && latestResponseDelta === 0 && (latestUrlDelta > 0 || latest.crawl.exitCode === 0)) {
    diagnostics.push('latest-crawl-started-but-no-fetch-evidence');
  }
  if (latest.recent.sampleCount === 0) diagnostics.push('latest-report-has-no-recent-samples');
  if (latest.database.latestFetchedAt && latest.crawl?.startedAt) {
    const latestFetchedMs = parseDate(latest.database.latestFetchedAt, 'latestFetchedAt')?.getTime();
    const crawlStartedMs = parseDate(latest.crawl.startedAt, 'crawlStartedAt')?.getTime();
    if (Number.isFinite(latestFetchedMs) && Number.isFinite(crawlStartedMs) && latestFetchedMs < crawlStartedMs) {
      diagnostics.push('latest-fetched-at-before-crawl-window');
    }
  }
  if (latest.crawl?.timedOut) diagnostics.push('latest-crawl-command-timed-out');
  if (latest.crawl?.error) diagnostics.push('latest-crawl-command-error');
  if (latest.crawl?.watchFinal?.stoppedReason === 'timeout') diagnostics.push('latest-watch-loop-timed-out');
  if (latest.crawl?.watchFinal?.stoppedReason === 'local-job-terminal-without-min-fetches') {
    diagnostics.push('latest-local-job-terminal-without-fetch-evidence');
  }
  if (latest.crawl?.watchFinal?.stoppedReason === 'local-job-failed') {
    diagnostics.push('latest-local-job-failed');
  }
  const watchJobCounts = latest.crawl?.watchJobs?.counts;
  const dbProofSatisfied = latest.crawl?.watchFinal?.minFetchesMet === true;
  if (watchJobCounts && Number(watchJobCounts.running || 0) > 0 && !dbProofSatisfied) {
    diagnostics.push('latest-local-job-still-running-at-watch-end');
  }
  if (watchJobCounts && Number(watchJobCounts.failed || 0) > 0) {
    diagnostics.push('latest-local-job-failed');
  }
  if (latest.crawl?.watchFinal && latest.crawl.watchFinal.minFetchesMet === false) diagnostics.push('latest-watch-min-fetches-not-met');
  if (latest.timings.slowSteps.length) diagnostics.push('latest-report-has-slow-db-evidence');

  if (previous) {
    const previousSuccessDelta = reportDeltaValue(previous.database?.delta, 'successResponses');
    if (latestSuccessDelta < previousSuccessDelta) diagnostics.push('latest-success-delta-below-previous-report');
    if (latest.recent.success < previous.recent.success) diagnostics.push('latest-recent-success-below-previous-report');
    if (latest.timings.maxMs > previous.timings.maxMs && latest.timings.maxMs > latest.timings.slowQueryWarningMs) {
      diagnostics.push('latest-db-evidence-slower-than-previous-report');
    }
    if (previous.readinessLabel !== 'verification-blocked' && latest.readinessLabel === 'verification-blocked') {
      diagnostics.push('latest-readiness-regressed-to-blocked');
    }
  }

  return uniqueBounded(diagnostics, HARD_MAX_COMPARISON_DIAGNOSTICS);
}

function buildMonitoredSmallCrawlComparison(input = {}) {
  const generatedAt = new Date().toISOString();
  const suppliedReports = Array.isArray(input.reports) ? input.reports : [];
  const reportPaths = Array.isArray(input.reportPaths) ? input.reportPaths : [];
  const pathReports = reportPaths.map((reportPath) => ({
    report: readBoundedJson(reportPath, 'monitored small-crawl report'),
    sourcePath: reportPath,
  }));
  const reports = [
    ...suppliedReports.map((report, index) => ({
      report,
      sourcePath: input.sourcePaths?.[index] || null,
    })),
    ...pathReports,
  ].slice(0, HARD_MAX_COMPARISON_REPORTS);

  if (!reports.length) {
    throw new Error('comparison requires at least one monitored small-crawl report');
  }
  if (suppliedReports.length + reportPaths.length > HARD_MAX_COMPARISON_REPORTS) {
    throw new Error(`comparison accepts at most ${HARD_MAX_COMPARISON_REPORTS} reports`);
  }

  const summaries = reports.map((entry, index) => summarizeMonitoredSmallCrawlReport(entry.report, {
    sourcePath: entry.sourcePath,
    label: index === reports.length - 1 ? 'latest' : `prior-${index + 1}`,
  }));
  const latest = summaries[summaries.length - 1];
  const stablePassEvidence = evaluateStablePassEvidence(latest);
  const diagnostics = buildComparisonDiagnostics(summaries);
  const blockers = uniqueBounded([
    ...latest.blockers,
    ...stablePassEvidence.missing.map(item => `missing-stable-evidence:${item}`),
  ]);
  const warnings = uniqueBounded([
    ...summaries.flatMap(summary => summary.warnings),
    ...diagnostics,
  ]);
  const readinessCounts = summaries.reduce((counts, summary) => {
    const label = summary.readinessLabel || 'unknown';
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'monitored-small-crawl-comparison',
    generatedAt,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      forceDeploys: false,
      changesCollectBehavior: false,
    },
    reportCount: summaries.length,
    latest: {
      sourcePath: latest.sourcePath,
      generatedAt: latest.generatedAt,
      readinessLabel: latest.readinessLabel,
      profile: latest.command.profile,
      host: latest.target?.host || latest.hosts.requested[0] || null,
      dbDelta: latest.database.delta,
      recent: latest.recent,
      timing: latest.timings,
      jobEvidence: latest.crawl ? {
        launchJobs: latest.crawl.launchJobs,
        watchJobs: latest.crawl.watchJobs,
      } : null,
    },
    readinessCounts,
    stablePassEvidence,
    diagnostics,
    reports: summaries,
    blockers,
    warnings,
    nextSafestAction: blockers.length
      ? 'fix latest monitored small-crawl evidence before broadening crawl cadence'
      : 'record comparison and run the next bounded monitored local crawl when useful',
  };
}

function getJobEvidenceCaveat(summary) {
  const watchJobCounts = summary.crawl?.watchJobs?.counts;
  if (!watchJobCounts) return null;
  const running = reportNumber(watchJobCounts.running);
  const failed = reportNumber(watchJobCounts.failed);
  const completed = reportNumber(watchJobCounts.completed);
  const minFetchesMet = summary.crawl?.watchFinal?.minFetchesMet === true;
  const successDelta = reportDeltaValue(summary.database?.delta, 'successResponses');
  const contentDelta = reportDeltaValue(summary.database?.delta, 'content');
  const recentSuccess = reportNumber(summary.recent?.success);
  const dbProofSatisfied = minFetchesMet || successDelta > 0 || contentDelta > 0 || recentSuccess > 0;

  if (running > 0 && dbProofSatisfied) return 'stale-running-job-nonblocking-db-proof-present';
  if (running > 0) return 'running-job-blocking-without-db-proof';
  if (failed > 0) return 'failed-job-blocking';
  if (completed > 0 && !dbProofSatisfied) return 'terminal-job-blocking-without-db-proof';
  return null;
}

function buildCadenceTimeline(summaries) {
  return summaries.map((summary) => {
    const delta = summary.database.delta || {};
    const jobCounts = summary.crawl?.watchJobs?.counts || null;
    const stablePassEvidence = evaluateStablePassEvidence(summary);
    return {
      label: summary.label || null,
      sourcePath: summary.sourcePath,
      generatedAt: summary.generatedAt,
      readinessLabel: summary.readinessLabel,
      passed: stablePassEvidence.passed,
      profile: summary.command.profile,
      host: summary.target?.host || summary.hosts.requested[0] || null,
      dbDelta: {
        urls: reportDeltaValue(delta, 'urls'),
        responses: reportDeltaValue(delta, 'responses'),
        successResponses: reportDeltaValue(delta, 'successResponses'),
        content: reportDeltaValue(delta, 'content'),
      },
      recent: {
        downloads: reportNumber(summary.recent.downloads),
        success: reportNumber(summary.recent.success),
        failed: reportNumber(summary.recent.failed),
        sampleCount: reportNumber(summary.recent.sampleCount),
        latestSampleAt: summary.recent.latestSampleAt || null,
      },
      timing: {
        maxMs: reportNumber(summary.timings.maxMs),
        totalMs: reportNumber(summary.timings.totalMs),
        slowStepCount: Array.isArray(summary.timings.slowSteps) ? summary.timings.slowSteps.length : 0,
      },
      jobEvidence: jobCounts ? {
        running: reportNumber(jobCounts.running),
        completed: reportNumber(jobCounts.completed),
        failed: reportNumber(jobCounts.failed),
        stoppedReason: summary.crawl?.watchFinal?.stoppedReason || null,
        minFetchesMet: summary.crawl?.watchFinal?.minFetchesMet === true,
        caveat: getJobEvidenceCaveat(summary),
      } : null,
    };
  });
}

function countConsecutiveFromEnd(items, predicate) {
  let count = 0;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!predicate(items[index])) break;
    count += 1;
  }
  return count;
}

function buildMonitoredSmallCrawlCadence(input = {}) {
  const comparison = buildMonitoredSmallCrawlComparison(input);
  const timeline = buildCadenceTimeline(comparison.reports);
  const passCount = timeline.filter(row => row.passed).length;
  const failCount = timeline.length - passCount;
  const blockedCount = timeline.filter(row => row.readinessLabel === 'verification-blocked').length;
  const latest = timeline[timeline.length - 1];
  const totalDbDelta = timeline.reduce((acc, row) => {
    acc.urls += reportNumber(row.dbDelta.urls);
    acc.responses += reportNumber(row.dbDelta.responses);
    acc.successResponses += reportNumber(row.dbDelta.successResponses);
    acc.content += reportNumber(row.dbDelta.content);
    return acc;
  }, { urls: 0, responses: 0, successResponses: 0, content: 0 });
  const maxDbEvidenceMs = timeline.reduce((max, row) => Math.max(max, reportNumber(row.timing.maxMs)), 0);
  const jobCaveats = uniqueBounded(timeline.map(row => row.jobEvidence?.caveat).filter(Boolean));

  return {
    ...comparison,
    mode: 'monitored-small-crawl-cadence',
    cadence: {
      reportCount: timeline.length,
      latestPassed: Boolean(latest?.passed),
      latestReadinessLabel: latest?.readinessLabel || 'unknown',
      passCount,
      failCount,
      blockedCount,
      consecutivePasses: countConsecutiveFromEnd(timeline, row => row.passed),
      consecutiveFailures: countConsecutiveFromEnd(timeline, row => !row.passed),
      totalDbDelta,
      maxDbEvidenceMs,
      jobCaveats,
      remoteBlockerPolicy: 'remote queue/deploy/readiness blockers remain out-of-band; do not broaden remote work without current queue-summary/readiness proof',
    },
    timeline,
    nextSafestAction: comparison.blockers.length
      ? 'fix latest monitored small-crawl cadence evidence before broadening crawl cadence'
      : 'record cadence artifact and run the next bounded monitored local crawl when useful',
  };
}

function missingRequestedHosts(evidence, requestedHosts) {
  if (!requestedHosts.length) return [];
  const evidenceHosts = Array.isArray(evidence?.hosts) ? evidence.hosts.map(row => row.host).filter(Boolean) : [];
  return requestedHosts.filter(host => !evidenceHosts.some(evidenceHost => hostMatches(evidenceHost, host)));
}

function buildMonitoredSmallCrawlReport(input = {}) {
  const options = normalizeOptions(input.options || input);
  const baselineSnapshot = input.baselineSnapshot || null;
  const postSnapshot = input.postSnapshot || input.snapshot || null;
  const recentEvidence = input.recentEvidence || {};
  const samples = normalizeSampleRows(input.samples || [], options);
  const queryTimings = normalizeQueryTimings(input.queryTimings);
  const delta = baselineSnapshot ? buildDelta(baselineSnapshot, postSnapshot) : null;
  const blockers = [];
  const warnings = [];

  if (postSnapshot && postSnapshot.available === false) blockers.push('db-snapshot-unavailable');
  if (recentEvidence.available === false) blockers.push('recent-download-evidence-unavailable');

  const downloads = Number(recentEvidence.downloads || 0);
  const success = Number(recentEvidence.success || 0);
  const failed = Number(recentEvidence.failed || 0);
  const missingHosts = missingRequestedHosts(recentEvidence, options.hosts);

  if (options.hosts.length && missingHosts.length) {
    warnings.push(`no recent downloads matched requested host(s): ${missingHosts.join(', ')}`);
  }
  if (downloads === 0) {
    warnings.push('no downloads were found in the monitored time window');
  }
  if (failed > 0) {
    warnings.push(`${failed} failed response(s) were found in the monitored time window`);
  }
  for (const timing of queryTimings) {
    if (timing.ms > DEFAULT_SLOW_DB_EVIDENCE_MS) {
      warnings.push(`slow DB evidence step ${timing.name}: ${timing.ms}ms`);
    }
  }
  if (options.expectedMinDownloads > 0 && success < options.expectedMinDownloads) {
    blockers.push('expected-download-count-not-met');
  }
  if (baselineSnapshot && delta.successResponses < options.expectedMinDownloads) {
    blockers.push('db-success-delta-below-expected');
  }

  let readinessLabel = 'verified-new-data';
  if (blockers.length) {
    readinessLabel = 'verification-blocked';
  } else if (downloads === 0) {
    readinessLabel = 'no-new-data';
  } else if (failed > 0) {
    readinessLabel = 'verified-with-failures';
  } else if (missingHosts.length) {
    readinessLabel = 'verified-host-partial';
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'monitored-small-crawl-report',
    generatedAt: options.generatedAt,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      forceDeploys: false,
      changesCollectBehavior: false,
    },
    command: {
      profile: options.profile,
      command: options.command,
      expectedMinDownloads: options.expectedMinDownloads,
    },
    window: {
      since: options.since,
      until: options.until,
      minutes: options.windowMinutes,
    },
    hosts: {
      requested: options.hosts,
      missingRecentEvidence: missingHosts,
    },
    database: {
      path: options.dbPath,
      baseline: baselineSnapshot ? {
        generatedAt: baselineSnapshot.generatedAt || baselineSnapshot.capturedAt || null,
        totals: getTotals(baselineSnapshot.dbSnapshot || baselineSnapshot),
      } : null,
      post: postSnapshot ? {
        generatedAt: postSnapshot.generatedAt || postSnapshot.capturedAt || null,
        available: postSnapshot.available !== false,
        latestFetchedAt: postSnapshot.latestFetchedAt || null,
        totals: getTotals(postSnapshot.dbSnapshot || postSnapshot),
      } : null,
      delta,
    },
    recent: {
      available: recentEvidence.available !== false,
      downloads,
      success,
      failed,
      bytes: Number(recentEvidence.bytes || 0),
      distinctHosts: Number(recentEvidence.distinctHosts || 0),
      hosts: Array.isArray(recentEvidence.hosts) ? recentEvidence.hosts.slice(0, HARD_MAX_HOSTS) : [],
      statuses: Array.isArray(recentEvidence.statuses) ? recentEvidence.statuses.slice(0, HARD_MAX_SAMPLE_LIMIT) : [],
      samples,
    },
    evidence: {
      queryTimings,
      slowQueryWarningMs: DEFAULT_SLOW_DB_EVIDENCE_MS,
    },
    readinessLabel,
    blockers,
    warnings,
    nextSafestAction: blockers.length
      ? 'fix-monitoring-or-db-evidence-before-trusting-the-crawl'
      : 'review-recent-downloads-and-run-next-bounded-small-crawl',
  };
}

function buildBaselineArtifact(snapshot, options = {}) {
  const normalized = normalizeOptions(options);
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'monitored-small-crawl-baseline',
    generatedAt: normalized.generatedAt,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
      changesCollectBehavior: false,
    },
    database: {
      path: normalized.dbPath,
      snapshot,
    },
    hosts: normalized.hosts,
    window: {
      since: normalized.since,
      until: normalized.until,
      minutes: normalized.windowMinutes,
    },
  };
}

function readBoundedJson(filePath, label) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`${label} is ${stat.size} bytes; max is ${MAX_EVIDENCE_BYTES}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function collectRecentCrawlOverview(options = {}, deps = {}) {
  const normalized = normalizeOptions(options);
  const openDb = deps.openDb || ((dbPath) => openNewsCrawlerDb(dbPath, { readonly: true }));
  const queries = deps.downloadEvidence || downloadEvidence;
  const db = openDb(normalized.dbPath);
  const queryTimings = [];
  try {
    const snapshot = timedDbEvidenceStep('snapshot', queryTimings, () => queries.getCloudCrawlDatabaseSnapshot(db, {
      path: normalized.dbPath,
      capturedAt: normalized.generatedAt,
    }));
    const recentEvidence = timedDbEvidenceStep('recent-evidence', queryTimings, () => queries.getCloudCrawlRecentEvidence(db, {
      startedAt: normalized.since,
      finishedAt: normalized.until,
      domains: normalized.hosts,
    }));
    const windowRows = timedDbEvidenceStep('window-samples', queryTimings, () => queries.getDownloadEvidence(
      db,
      normalized.since,
      normalized.until,
      Math.min(HARD_MAX_SAMPLE_LIMIT, normalized.sampleLimit * 5)
    ));
    const recentRows = timedDbEvidenceStep('recent-samples', queryTimings, () => (typeof queries.listRecentDownloads === 'function'
      ? queries.listRecentDownloads(db, { limit: HARD_MAX_SAMPLE_LIMIT })
      : []));

    return buildMonitoredSmallCrawlReport({
      options: normalized,
      postSnapshot: snapshot,
      recentEvidence,
      samples: [...windowRows, ...recentRows],
      queryTimings,
    });
  } finally {
    if (db && typeof db.close === 'function') db.close();
  }
}

function collectBaseline(options = {}, deps = {}) {
  const normalized = normalizeOptions(options);
  const openDb = deps.openDb || ((dbPath) => openNewsCrawlerDb(dbPath, { readonly: true }));
  const queries = deps.downloadEvidence || downloadEvidence;
  const db = openDb(normalized.dbPath);
  try {
    const snapshot = queries.getCloudCrawlDatabaseSnapshot(db, {
      path: normalized.dbPath,
      capturedAt: normalized.generatedAt,
    });
    return buildBaselineArtifact(snapshot, normalized);
  } finally {
    if (db && typeof db.close === 'function') db.close();
  }
}

function collectVerification(options = {}, deps = {}) {
  const normalized = normalizeOptions(options);
  const baseline = options.baselineArtifact || readBoundedJson(options.baselinePath || options.baseline, 'baseline artifact');
  const openDb = deps.openDb || ((dbPath) => openNewsCrawlerDb(dbPath, { readonly: true }));
  const queries = deps.downloadEvidence || downloadEvidence;
  const db = openDb(normalized.dbPath);
  const queryTimings = [];
  try {
    const postSnapshot = timedDbEvidenceStep('snapshot', queryTimings, () => queries.getCloudCrawlDatabaseSnapshot(db, {
      path: normalized.dbPath,
      capturedAt: normalized.generatedAt,
    }));
    const recentEvidence = timedDbEvidenceStep('recent-evidence', queryTimings, () => queries.getCloudCrawlRecentEvidence(db, {
      startedAt: normalized.since,
      finishedAt: normalized.until,
      domains: normalized.hosts,
    }));
    const windowRows = timedDbEvidenceStep('window-samples', queryTimings, () => queries.getDownloadEvidence(
      db,
      normalized.since,
      normalized.until,
      Math.min(HARD_MAX_SAMPLE_LIMIT, normalized.sampleLimit * 5)
    ));
    const recentRows = timedDbEvidenceStep('recent-samples', queryTimings, () => (typeof queries.listRecentDownloads === 'function'
      ? queries.listRecentDownloads(db, { limit: HARD_MAX_SAMPLE_LIMIT })
      : []));

    return buildMonitoredSmallCrawlReport({
      options: normalized,
      baselineSnapshot: baseline ? {
        generatedAt: baseline.generatedAt,
        ...baseline.database?.snapshot,
      } : null,
      postSnapshot,
      recentEvidence,
      samples: [...windowRows, ...recentRows],
      queryTimings,
    });
  } finally {
    if (db && typeof db.close === 'function') db.close();
  }
}

function renderMonitoredSmallCrawlText(report) {
  const lines = [];
  lines.push('Monitored Small Crawl Report');
  lines.push(`Readiness: ${report.readinessLabel}`);
  lines.push(`Window: ${report.window.since} -> ${report.window.until}`);
  lines.push(`Hosts: ${report.hosts.requested.length ? report.hosts.requested.join(', ') : '(all)'}`);
  lines.push(`Downloads: total=${report.recent.downloads} success=${report.recent.success} failed=${report.recent.failed} bytes=${report.recent.bytes}`);
  if (report.database.delta) {
    lines.push(`DB delta: responses=${report.database.delta.responses} success=${report.database.delta.successResponses} content=${report.database.delta.content}`);
  }
  if (report.evidence?.queryTimings?.length) {
    const timings = report.evidence.queryTimings
      .map(row => `${row.name}=${row.ms}ms`)
      .join(' ');
    lines.push(`DB evidence timings: ${timings}`);
  }
  if (report.blockers.length) {
    lines.push('Blockers:');
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  if (report.recent.samples.length) {
    lines.push('Recent samples:');
    for (const sample of report.recent.samples) {
      lines.push(`- ${sample.host} HTTP ${sample.httpStatus || '-'} ${sample.bytesDownloaded}B ${sample.fetchedAt || '-'} ${sample.url}`);
    }
  }
  lines.push('No-action policy: this report does not start crawlers, contact remote hosts, write local DB rows, prune queues, force deploy, or change collect behavior.');
  lines.push(`Next: ${report.nextSafestAction}`);
  return `${lines.join('\n')}\n`;
}

function renderMonitoredSmallCrawlComparisonText(comparison) {
  const lines = [];
  lines.push('Monitored Small Crawl Comparison');
  lines.push(`Reports: ${comparison.reportCount}`);
  lines.push(`Latest readiness: ${comparison.latest.readinessLabel}`);
  if (comparison.latest.sourcePath) lines.push(`Latest report: ${comparison.latest.sourcePath}`);
  if (comparison.latest.host) lines.push(`Latest host: ${comparison.latest.host}`);
  const delta = comparison.latest.dbDelta;
  if (delta) {
    lines.push(`Latest DB delta: responses=${delta.responses} success=${delta.successResponses} content=${delta.content}`);
  }
  const recent = comparison.latest.recent || {};
  lines.push(`Latest recent: downloads=${recent.downloads || 0} success=${recent.success || 0} failed=${recent.failed || 0} samples=${recent.sampleCount || 0}`);
  const timing = comparison.latest.timing || {};
  lines.push(`Latest DB evidence timing: max=${timing.maxMs || 0}ms total=${timing.totalMs || 0}ms slowSteps=${(timing.slowSteps || []).length}`);
  const watchJobCounts = comparison.latest.jobEvidence?.watchJobs?.counts;
  if (watchJobCounts) {
    lines.push(`Latest local jobs: running=${watchJobCounts.running || 0} completed=${watchJobCounts.completed || 0} failed=${watchJobCounts.failed || 0}`);
  }
  lines.push(`Stable pass: ${comparison.stablePassEvidence.passed ? 'yes' : 'no'}`);
  if (comparison.stablePassEvidence.missing.length) {
    lines.push(`Missing evidence: ${comparison.stablePassEvidence.missing.join(', ')}`);
  }
  if (comparison.diagnostics.length) {
    lines.push('Diagnostics:');
    for (const item of comparison.diagnostics) lines.push(`- ${item}`);
  }
  if (comparison.reports.length) {
    lines.push('Report rows:');
    for (const summary of comparison.reports) {
      const rowDelta = summary.database.delta;
      const deltaText = rowDelta
        ? `deltaSuccess=${rowDelta.successResponses} deltaContent=${rowDelta.content}`
        : 'delta=n/a';
      lines.push(`- ${summary.label || '-'} ${summary.readinessLabel} downloads=${summary.recent.downloads} success=${summary.recent.success} ${deltaText} maxDbMs=${summary.timings.maxMs}`);
    }
  }
  if (comparison.blockers.length) {
    lines.push('Blockers:');
    for (const blocker of comparison.blockers) lines.push(`- ${blocker}`);
  }
  if (comparison.warnings.length) {
    lines.push('Warnings:');
    for (const warning of comparison.warnings) lines.push(`- ${warning}`);
  }
  lines.push('No-action policy: this comparison does not start crawlers, contact remote hosts, write local DB rows, prune queues, force deploy, or change collect behavior.');
  lines.push(`Next: ${comparison.nextSafestAction}`);
  return `${lines.join('\n')}\n`;
}

function renderMonitoredSmallCrawlCadenceText(cadence) {
  const lines = [];
  lines.push('Monitored Small Crawl Cadence');
  lines.push(`Reports: ${cadence.cadence.reportCount}`);
  lines.push(`Latest readiness: ${cadence.cadence.latestReadinessLabel}`);
  lines.push(`Latest pass: ${cadence.cadence.latestPassed ? 'yes' : 'no'}`);
  lines.push(`Pass/fail: pass=${cadence.cadence.passCount} fail=${cadence.cadence.failCount} blocked=${cadence.cadence.blockedCount}`);
  lines.push(`Consecutive: pass=${cadence.cadence.consecutivePasses} fail=${cadence.cadence.consecutiveFailures}`);
  lines.push(`Total DB delta: urls=${cadence.cadence.totalDbDelta.urls} responses=${cadence.cadence.totalDbDelta.responses} success=${cadence.cadence.totalDbDelta.successResponses} content=${cadence.cadence.totalDbDelta.content}`);
  lines.push(`Max DB evidence timing: ${cadence.cadence.maxDbEvidenceMs}ms`);
  if (cadence.cadence.jobCaveats.length) {
    lines.push(`Job caveats: ${cadence.cadence.jobCaveats.join(', ')}`);
  }
  lines.push('Timeline:');
  for (const row of cadence.timeline) {
    const jobText = row.jobEvidence?.caveat ? ` job=${row.jobEvidence.caveat}` : '';
    lines.push(`- ${row.label || '-'} ${row.readinessLabel} pass=${row.passed ? 'yes' : 'no'} downloads=${row.recent.downloads} success=${row.recent.success} deltaSuccess=${row.dbDelta.successResponses} deltaContent=${row.dbDelta.content} maxDbMs=${row.timing.maxMs}${jobText}`);
  }
  if (cadence.diagnostics.length) {
    lines.push('Diagnostics:');
    for (const item of cadence.diagnostics) lines.push(`- ${item}`);
  }
  if (cadence.blockers.length) {
    lines.push('Blockers:');
    for (const blocker of cadence.blockers) lines.push(`- ${blocker}`);
  }
  if (cadence.warnings.length) {
    lines.push('Warnings:');
    for (const warning of cadence.warnings) lines.push(`- ${warning}`);
  }
  lines.push(`Remote policy: ${cadence.cadence.remoteBlockerPolicy}`);
  lines.push('No-action policy: this cadence report does not start crawlers, contact remote hosts, write local DB rows, prune queues, force deploy, or change collect behavior.');
  lines.push(`Next: ${cadence.nextSafestAction}`);
  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_SAMPLE_LIMIT,
  DEFAULT_WINDOW_MINUTES,
  DEFAULT_LOCAL_SMOKE_HOST,
  DEFAULT_LOCAL_SMOKE_UI_HOST,
  DEFAULT_LOCAL_SMOKE_UI_PORT,
  HARD_MAX_HOSTS,
  HARD_MAX_LOCAL_SMOKE_DEPTH,
  HARD_MAX_LOCAL_SMOKE_PAGES,
  HARD_MAX_SAMPLE_LIMIT,
  HARD_MAX_QUERY_TIMINGS,
  HARD_MAX_COMPARISON_REPORTS,
  SCHEMA_VERSION,
  anyHostMatches,
  buildBaselineArtifact,
  buildDelta,
  buildLocalSmokeCommand,
  buildLocalSmokePlan,
  buildLocalSmokeRunReport,
  buildMonitoredSmallCrawlCadence,
  buildMonitoredSmallCrawlComparison,
  buildMonitoredSmallCrawlReport,
  collectBaseline,
  collectRecentCrawlOverview,
  collectVerification,
  evaluateStablePassEvidence,
  hostFromUrl,
  hostMatches,
  normalizeLocalSmokeOptions,
  normalizeOptions,
  normalizeQueryTimings,
  normalizeSampleRows,
  parseHosts,
  readBoundedJson,
  renderMonitoredSmallCrawlCadenceText,
  renderMonitoredSmallCrawlComparisonText,
  renderMonitoredSmallCrawlText,
  summarizeMonitoredSmallCrawlReport,
};
