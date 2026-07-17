'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildMonitoredSmallCrawlComparison,
  hostFromUrl,
  parseHosts,
  readBoundedJson,
} = require('./monitored-small-crawl');
const { buildFixturePlan } = require('./local-fixture-server');
const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
// news-crawler-db exports every download-evidence query this file uses
// (was the src/data/db/queries/downloadEvidence re-export shim).
const downloadEvidence = require('news-crawler-db');

const SCHEMA_VERSION = 1;
const DEFAULT_DB_PATH = 'data/news.db';
const DEFAULT_UI_HOST = '127.0.0.1';
const MAX_PACKET_EVIDENCE_BYTES = 128 * 1024;
const TARGET_FRESHNESS_RECENT_HOURS = 24;

const CRAWL_CLASSES = Object.freeze({
  'tiny-local': {
    label: 'Tiny local monitored smoke',
    minHosts: 1,
    maxHosts: 1,
    defaultHosts: ['www.bbc.com'],
    defaultUrls: ['https://www.bbc.com/news'],
    defaultProfile: 'local-tiny-monitored-smoke',
    maxPages: 1,
    maxDepth: 0,
    concurrency: 1,
    expectedMinDownloads: 1,
    watchTimeoutSec: 180,
    launchTimeoutSec: 180,
    noOutputTimeoutSec: 90,
    uiPort: 3171,
    nextClass: 'small-local',
  },
  'small-local': {
    label: 'Small local reliability proof',
    minHosts: 1,
    maxHosts: 3,
    defaultHosts: ['bbc.com', 'reuters.com'],
    defaultUrls: ['https://www.bbc.com/news', 'https://www.reuters.com/world/'],
    defaultProfile: 'local-small-reliability',
    maxPages: 1,
    maxDepth: 0,
    concurrency: 1,
    expectedMinDownloads: 1,
    watchTimeoutSec: 240,
    launchTimeoutSec: 180,
    noOutputTimeoutSec: 90,
    uiPort: 3172,
    nextClass: 'medium-local',
  },
  'medium-local': {
    label: 'Medium local orchestration proof',
    minHosts: 3,
    maxHosts: 5,
    defaultHosts: ['bbc.com', 'reuters.com', 'apnews.com'],
    defaultUrls: ['https://www.bbc.com/news', 'https://www.reuters.com/world/', 'https://apnews.com/'],
    defaultProfile: 'local-medium-reliability',
    maxPages: 1,
    maxDepth: 0,
    concurrency: 2,
    expectedMinDownloads: 2,
    watchTimeoutSec: 360,
    launchTimeoutSec: 180,
    noOutputTimeoutSec: 90,
    uiPort: 3173,
    nextClass: null,
  },
});

function toIso(value, label = 'generatedAt') {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date/time`);
  }
  return date.toISOString();
}

function normalizeCrawlClass(value) {
  const normalized = String(value || 'tiny-local').trim().toLowerCase();
  if (!CRAWL_CLASSES[normalized]) {
    throw new Error(`unknown crawl class: ${normalized}`);
  }
  return normalized;
}

function normalizePositiveInt(value, fallback, min, max, label) {
  const parsed = Number.parseInt(value, 10);
  const n = Number.isFinite(parsed) ? parsed : fallback;
  if (n < min || n > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return n;
}

function splitValues(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
}

function normalizeUrls(value, defaults) {
  const raw = splitValues(value);
  const values = raw.length ? raw : defaults;
  return values
    .map(normalizeUrl)
    .filter(Boolean);
}

function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function allTargetsAreLoopback(urls) {
  const targets = Array.isArray(urls) ? urls : [];
  return targets.length > 0 && targets.every(url => isLoopbackHost(hostFromUrl(url)));
}

function normalizeHostsForPacket(value, urls, defaults, crawlClass, classSpec) {
  const hosts = value
    ? parseHosts(value)
    : (urls && urls.length
      ? parseHosts(urls.map(url => hostFromUrl(url)).filter(Boolean))
      : defaults.slice());

  if (hosts.length < classSpec.minHosts || hosts.length > classSpec.maxHosts) {
    throw new Error(`${crawlClass} requires ${classSpec.minHosts}-${classSpec.maxHosts} host(s)`);
  }
  return hosts;
}

function normalizeHostName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function hostMatches(expectedHost, actualHost) {
  const expected = normalizeHostName(expectedHost);
  const actual = normalizeHostName(actualHost);
  if (!expected || !actual) return false;
  return actual === expected || actual.endsWith(`.${expected}`) || expected.endsWith(`.${actual}`);
}

function hostForEvidenceItem(item) {
  const url = item?.url || item?.startUrl || item?.body?.job?.startUrl || item?.targetUrl || '';
  if (url) return hostFromUrl(url);
  return item?.host || item?.domain || null;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function commandObject(args, env = {}) {
  const envEntries = Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}=${value}`);
  return {
    executable: 'node',
    env,
    args,
    display: [...envEntries, 'node', ...args].map(shellQuote).join(' '),
  };
}

function hostCsv(hosts) {
  return hosts.join(',');
}

function buildWatchedLocalRunCommand(options) {
  const args = [
    'tools/crawl/run.js',
    '--local',
    '--profile', 'gentle',
    '--max-pages', String(options.maxPages),
    '--max-depth', String(options.maxDepth),
    '--concurrency', String(options.concurrency),
    '--batch-retries', '0',
    '--batch-request-timeout-ms', '60000',
    '--per-domain-interval-ms', '1000',
    '--override', 'preferCache=false',
    '--override', 'maxAgeMs=0',
    '--override', 'useSitemap=false',
    '--override', 'sitemapOnly=false',
    '--override', 'skipQueryUrls=false',
    '--watch',
    '--watch-interval', String(options.watchIntervalMs),
    '--watch-timeout', String(options.watchTimeoutSec),
    '--watch-min-fetches', String(options.expectedMinDownloads),
    '--watch-min-hosts', String(options.expectedMinHosts),
    '--launch-timeout', String(options.launchTimeoutSec),
    '--no-output-timeout', String(options.noOutputTimeoutSec),
    '--auto-stop',
    '--no-meter',
    '--json',
    '--db', options.dbPath,
    '--ui-host', options.uiHost,
    '--ui-port', String(options.uiPort),
    options.urls.join(','),
  ];
  return commandObject(args, {
    CRAWL_RUN_SERVER_READY_TIMEOUT_MS: String(Math.max(90000, options.watchTimeoutSec * 1000)),
  });
}

function addExplainFlag(command) {
  const args = command.args.slice();
  const insertAt = args.indexOf('--json');
  if (insertAt === -1) {
    args.splice(1, 0, '--explain', '--json');
  } else {
    args.splice(insertAt, 0, '--explain');
  }
  return commandObject(args);
}

function monitoredLocalSmokeExecuteCommand(options) {
  const args = [
    'tools/crawl/monitored-small-crawl.js',
    'local-smoke',
    '--execute',
    '--json',
    '--db', options.dbPath,
    '--url', options.urls[0],
    '--host', options.hosts[0],
    '--max-pages', String(options.maxPages),
    '--max-depth', String(options.maxDepth),
    '--watch-timeout', String(options.watchTimeoutSec),
    '--launch-timeout', String(options.launchTimeoutSec),
    '--no-output-timeout', String(options.noOutputTimeoutSec),
    '--expected-min-hosts', String(options.expectedMinHosts),
    '--ui-host', options.uiHost,
    '--ui-port', String(options.uiPort),
  ];
  if (options.defaultReportPath) {
    args.push('--out', options.defaultReportPath);
  }
  return commandObject(args);
}

function monitoredLocalSmokePlanCommand(options) {
  return commandObject([
    'tools/crawl/monitored-small-crawl.js',
    'local-smoke',
    '--json',
    '--db', options.dbPath,
    '--url', options.urls[0],
    '--host', options.hosts[0],
    '--max-pages', String(options.maxPages),
    '--max-depth', String(options.maxDepth),
    '--watch-timeout', String(options.watchTimeoutSec),
    '--launch-timeout', String(options.launchTimeoutSec),
    '--no-output-timeout', String(options.noOutputTimeoutSec),
    '--expected-min-hosts', String(options.expectedMinHosts),
    '--ui-host', options.uiHost,
    '--ui-port', String(options.uiPort),
  ]);
}

function normalizePacketOptions(options = {}) {
  const fixturePreset = options.fixturePreset || options['fixture-preset'] || null;
  const fixturePlan = fixturePreset
    ? buildFixturePlan({
      preset: fixturePreset,
      port: options.fixturePort || options['fixture-port'],
      targetToken: options.fixtureTargetToken || options['fixture-target-token'] || options.targetToken || options['target-token'],
      readyFile: options.fixtureReadyFile || options['fixture-ready-file'],
      pidFile: options.fixturePidFile || options['fixture-pid-file'],
    })
    : null;
  const explicitCrawlClass = options.crawlClass || options['crawl-class'] || options.class;
  const crawlClass = normalizeCrawlClass(explicitCrawlClass || fixturePlan?.crawlClass);
  if (fixturePlan && crawlClass !== fixturePlan.crawlClass) {
    throw new Error(`fixture preset ${fixturePlan.preset} requires crawl class ${fixturePlan.crawlClass}`);
  }
  const classSpec = CRAWL_CLASSES[crawlClass];
  const urls = normalizeUrls(options.urls || options.url, fixturePlan ? fixturePlan.urls : classSpec.defaultUrls);
  const hosts = normalizeHostsForPacket(
    options.hosts || options.host || options.domains || options.domain,
    urls,
    fixturePlan ? fixturePlan.hosts : classSpec.defaultHosts,
    crawlClass,
    classSpec
  );

  return {
    crawlClass,
    classSpec,
    fixturePlan,
    generatedAt: toIso(options.generatedAt || options['generated-at']),
    profile: String(options.profile || classSpec.defaultProfile),
    hosts,
    urls,
    dbPath: String(options.dbPath || options.db || DEFAULT_DB_PATH),
    maxPages: normalizePositiveInt(options.maxPages || options['max-pages'], classSpec.maxPages, 1, 20, 'max pages'),
    maxDepth: normalizePositiveInt(options.maxDepth || options['max-depth'], classSpec.maxDepth, 0, 3, 'max depth'),
    concurrency: normalizePositiveInt(options.concurrency, classSpec.concurrency, 1, 5, 'concurrency'),
    expectedMinDownloads: normalizePositiveInt(
      options.expectedMinDownloads || options['expected-min-downloads'],
      classSpec.expectedMinDownloads,
      0,
      20,
      'expected min downloads'
    ),
    expectedMinHosts: normalizePositiveInt(
      options.expectedMinHosts || options['expected-min-hosts'],
      hosts.length,
      0,
      classSpec.maxHosts,
      'expected min hosts'
    ),
    watchIntervalMs: normalizePositiveInt(options.watchIntervalMs || options['watch-interval'], 2000, 500, 60000, 'watch interval'),
    watchTimeoutSec: normalizePositiveInt(options.watchTimeoutSec || options['watch-timeout'], classSpec.watchTimeoutSec, 30, 1200, 'watch timeout'),
    launchTimeoutSec: normalizePositiveInt(options.launchTimeoutSec || options['launch-timeout'], classSpec.launchTimeoutSec, 30, 600, 'launch timeout'),
    noOutputTimeoutSec: normalizePositiveInt(options.noOutputTimeoutSec || options['no-output-timeout'], classSpec.noOutputTimeoutSec, 30, 300, 'no output timeout'),
    uiHost: String(options.uiHost || options['ui-host'] || DEFAULT_UI_HOST),
    uiPort: normalizePositiveInt(options.uiPort || options['ui-port'], classSpec.uiPort, 1024, 65535, 'UI port'),
    localSmokeReportPath: options.localSmokeReport || options['local-smoke-report'] || null,
    comparisonPath: options.comparison || options.compare || null,
    verificationReportPath: options.verificationReport || options['verification-report'] || options.verify || null,
    launchReportPath: options.launchReport || options['launch-report'] || options.launchResult || options['launch-result'] || null,
    watchLogPath: options.watchLog || options['watch-log'] || options.watchReport || options['watch-report'] || null,
    inspectTargetFreshness: Boolean(options.targetFreshness || options['target-freshness']),
    targetFreshnessReport: options.targetFreshnessReport || null,
    openDb: options.openDb || null,
    downloadEvidenceQueries: options.downloadEvidenceQueries || null,
    defaultReportPath: options.reportOut || options['report-out'] || 'tmp/local-smoke-report.json',
  };
}

function isRecentIsoish(value, hours = TARGET_FRESHNESS_RECENT_HOURS) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= hours * 60 * 60 * 1000;
}

function summarizeTargetFreshnessRows(rows = []) {
  const normalized = rows.map(row => {
    const hasResponse = Boolean(row && row.hasResponse);
    const latestFetchedAt = row?.latestFetchedAt || null;
    return {
      url: row?.url || null,
      host: row?.host || null,
      hasUrlRow: Boolean(row && row.hasUrlRow),
      hasResponse,
      httpStatus: row?.httpStatus ?? null,
      latestFetchedAt,
      recentlyFetched: isRecentIsoish(latestFetchedAt),
      historyCount: Number(row?.historyCount || 0),
      recommendation: hasResponse
        ? 'prefer a fresh exact URL for live proof, or accept no-new-data risk for this target'
        : 'target has no exact-response evidence in the local DB',
    };
  });
  return {
    available: true,
    checkedUrls: normalized.length,
    likelyAlreadyProcessed: normalized.filter(row => row.hasResponse).length,
    recentlyFetched: normalized.filter(row => row.recentlyFetched).length,
    rows: normalized,
  };
}

function inspectTargetFreshness(options) {
  if (options.targetFreshnessReport) return summarizeTargetFreshnessRows(options.targetFreshnessReport.rows || []);
  if (!options.inspectTargetFreshness) return null;
  const rows = [];
  let db = null;
  try {
    const dbPath = path.resolve(options.dbPath);
    if (!fs.existsSync(dbPath)) {
      return {
        available: false,
        reason: `db-missing:${options.dbPath}`,
        checkedUrls: options.urls.length,
        rows: [],
      };
    }
    const openDb = options.openDb || ((targetPath) => openNewsCrawlerDb(targetPath, { readonly: true, fileMustExist: true }));
    const queries = options.downloadEvidenceQueries || downloadEvidence;
    db = openDb(dbPath);
    for (const url of options.urls) {
      const bundle = queries.getUrlDownloadEvidenceBundle(db, url, { limit: 3 });
      const evidence = bundle?.evidence || null;
      const history = Array.isArray(bundle?.history) ? bundle.history : [];
      rows.push({
        url,
        host: hostFromUrl(url),
        hasUrlRow: Boolean(evidence?.url_id),
        hasResponse: Boolean(evidence?.http_response_id),
        httpStatus: evidence?.http_status ?? null,
        latestFetchedAt: evidence?.fetched_at || history[0]?.fetched_at || null,
        historyCount: history.length,
      });
    }
    return summarizeTargetFreshnessRows(rows);
  } catch (error) {
    return {
      available: false,
      reason: error.message || String(error),
      checkedUrls: options.urls.length,
      rows,
    };
  } finally {
    if (db && typeof db.close === 'function') {
      try { db.close(); } catch (_error) {}
    }
  }
}

function readBoundedText(filePath, label) {
  if (!filePath) return '';
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (stat.size > MAX_PACKET_EVIDENCE_BYTES) {
    throw new Error(`${label} is ${stat.size} bytes; max is ${MAX_PACKET_EVIDENCE_BYTES}`);
  }
  return fs.readFileSync(resolved, 'utf8');
}

function parseWatchFinalFromLog(filePath) {
  if (!filePath) return null;
  const text = readBoundedText(filePath, 'watch log');
  const lines = text.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"watchFinal"')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.watchFinal) return parsed.watchFinal;
    } catch (_error) {
      // Keep scanning older lines; stderr may include non-JSON diagnostics.
    }
  }
  return null;
}

function loadPacketEvidence(options) {
  const evidence = {
    localSmokeReportPath: options.localSmokeReportPath || null,
    localSmokeReport: null,
    comparisonPath: options.comparisonPath || null,
    comparison: null,
    verificationReportPath: options.verificationReportPath || null,
    verificationReport: null,
    launchReportPath: options.launchReportPath || null,
    launchReport: null,
    watchLogPath: options.watchLogPath || null,
    watchFinal: null,
    targetFreshness: null,
  };

  if (options.localSmokeReportPath) {
    evidence.localSmokeReport = readBoundedJson(options.localSmokeReportPath, 'local smoke report');
  }
  if (options.verificationReportPath) {
    evidence.verificationReport = readBoundedJson(options.verificationReportPath, 'verification report');
  }
  if (options.launchReportPath) {
    evidence.launchReport = readBoundedJson(options.launchReportPath, 'launch report');
  }
  if (options.watchLogPath) {
    evidence.watchFinal = parseWatchFinalFromLog(options.watchLogPath);
  }
  if (options.comparisonPath) {
    evidence.comparison = readBoundedJson(options.comparisonPath, 'local smoke comparison');
  } else if (evidence.localSmokeReport) {
    evidence.comparison = buildMonitoredSmallCrawlComparison({
      reports: [evidence.localSmokeReport],
      sourcePaths: [options.localSmokeReportPath],
    });
  }
  evidence.targetFreshness = inspectTargetFreshness(options);
  return evidence;
}

function sumNumber(items, key) {
  return items.reduce((sum, item) => sum + (Number(item?.[key] || 0) || 0), 0);
}

function buildHostProof(options, evidence) {
  const recentHosts = Array.isArray(evidence.verificationReport?.recent?.hosts)
    ? evidence.verificationReport.recent.hosts
    : [];
  const recentSamples = Array.isArray(evidence.verificationReport?.recent?.samples)
    ? evidence.verificationReport.recent.samples
    : [];
  const launchResults = Array.isArray(evidence.launchReport?.results)
    ? evidence.launchReport.results
    : [];
  const watchLaunchJobs = Array.isArray(evidence.watchFinal?.launchJobs?.items)
    ? evidence.watchFinal.launchJobs.items
    : [];
  const delta = evidence.verificationReport?.database?.delta || null;
  const singleHostRun = options.hosts.length === 1;

  return options.hosts.map((host) => {
    const hostRows = recentHosts.filter(row => hostMatches(host, row?.host));
    const hostSamples = recentSamples
      .filter(sample => hostMatches(host, hostForEvidenceItem(sample)))
      .slice(0, 3)
      .map(sample => ({
        url: sample.url || null,
        httpStatus: sample.http_status ?? sample.httpStatus ?? null,
        bytesDownloaded: sample.bytes_downloaded ?? sample.bytesDownloaded ?? null,
        fetchedAt: sample.fetched_at || sample.fetchedAt || null,
      }));
    const hostLaunchResults = launchResults.filter(result => hostMatches(host, hostForEvidenceItem(result)));
    const acceptedLaunchResults = hostLaunchResults.filter(result => result && result.ok === true);
    const failedLaunchResults = hostLaunchResults.filter(result => !result || result.ok === false);
    const hostWatchLaunchJobs = watchLaunchJobs.filter(job => hostMatches(host, hostForEvidenceItem(job)));

    return {
      host,
      launch: {
        accepted: acceptedLaunchResults.length,
        failed: failedLaunchResults.length,
        attempts: sumNumber(hostLaunchResults, 'attempts'),
      },
      watch: {
        launchJobs: hostWatchLaunchJobs.length,
      },
      db: {
        downloads: sumNumber(hostRows, 'downloads'),
        success: sumNumber(hostRows, 'success'),
        failed: sumNumber(hostRows, 'failed'),
        bytes: sumNumber(hostRows, 'bytes'),
        contentDelta: singleHostRun && delta ? Number(delta.content || 0) : null,
        contentDeltaScope: singleHostRun ? 'single-host-run-delta' : 'not-attributed-by-current-report',
      },
      samples: hostSamples,
    };
  });
}

function classifyEvidence(evidence) {
  const blockers = [];
  const warnings = [];
  const taxonomy = [];
  let localSmokeBlocked = false;
  let verificationReportSupplied = false;
  let verificationReportBlocked = false;
  let launchReportSupplied = false;
  let launchReportBlocked = false;
  let watchLogSupplied = false;
  let watchLogBlocked = false;
  let watchLogWarn = false;
  let targetFreshnessSupplied = false;
  let targetFreshnessWarn = false;
  let targetFreshnessUnavailable = false;
  let contentQualityWarn = false;
  let hostCoverageWarn = false;

  const report = evidence.localSmokeReport;
  const comparison = evidence.comparison;
  const verificationReport = evidence.verificationReport;
  const launchReport = evidence.launchReport;
  const watchFinal = evidence.watchFinal;
  const targetFreshness = evidence.targetFreshness;

  if (!report) {
    warnings.push('no local-smoke execution report supplied');
    taxonomy.push('stale-proof');
  } else {
    const reportBlockers = Array.isArray(report.blockers) ? report.blockers : [];
    if (reportBlockers.includes('crawl-command-failed')) taxonomy.push('runtime-error');
    if (reportBlockers.includes('expected-download-count-not-met')) taxonomy.push('no-new-data');
    if (reportBlockers.length) {
      localSmokeBlocked = true;
      blockers.push(...reportBlockers);
    }
    if (report.readinessLabel !== 'verified-new-data' && !reportBlockers.length) {
      warnings.push(`local smoke readiness is ${report.readinessLabel || 'unknown'}`);
    }
  }

  if (comparison) {
    const comparisonBlockers = Array.isArray(comparison.blockers) ? comparison.blockers : [];
    if (comparisonBlockers.includes('expected-download-count-not-met')) taxonomy.push('no-new-data');
    if (comparisonBlockers.some(item => String(item).includes('db-persistence'))) taxonomy.push('partial-persistence');
    if (Array.isArray(comparison.diagnostics) && comparison.diagnostics.some(item => String(item).includes('watch-loop-timed-out'))) {
      taxonomy.push('watch-timeout');
    }
    if (comparisonBlockers.length) {
      localSmokeBlocked = true;
      blockers.push(...comparisonBlockers);
    }
    warnings.push(...(Array.isArray(comparison.warnings) ? comparison.warnings : []));
  }

  if (verificationReport) {
    verificationReportSupplied = true;
    const verificationBlockers = Array.isArray(verificationReport.blockers) ? verificationReport.blockers : [];
    if (verificationBlockers.includes('expected-download-count-not-met')) taxonomy.push('no-new-data');
    if (verificationBlockers.includes('db-success-delta-below-expected')) taxonomy.push('partial-persistence');
    if (verificationBlockers.length) verificationReportBlocked = true;
    blockers.push(...verificationBlockers);
    warnings.push(...(Array.isArray(verificationReport.warnings) ? verificationReport.warnings : []));
    const missingRecentHosts = Array.isArray(verificationReport?.hosts?.missingRecentEvidence)
      ? verificationReport.hosts.missingRecentEvidence
      : [];
    if (!verificationReportBlocked && missingRecentHosts.length > 0) {
      hostCoverageWarn = true;
      taxonomy.push('host-mismatch');
      warnings.push(`DB proof is missing recent evidence for requested host(s): ${missingRecentHosts.join(', ')}`);
    }
    const recentBytes = Number(verificationReport?.recent?.bytes || 0);
    const recentDownloads = Number(verificationReport?.recent?.downloads || 0);
    const delta = verificationReport?.database?.delta || {};
    const deltaContent = Number(delta.content || 0);
    const deltaSuccess = Number(delta.successResponses || 0);
    const recentSamples = Array.isArray(verificationReport?.recent?.samples) ? verificationReport.recent.samples : [];
    const robotsOnly = recentSamples.length > 0
      && recentSamples.every(sample => String(sample?.url || '').toLowerCase().endsWith('/robots.txt'));
    const noContentDelta = deltaContent <= 0 && (deltaSuccess > 0 || recentBytes > 0 || recentDownloads > 0);
    if (!verificationReportBlocked && recentDownloads > 0 && (recentBytes <= 0 || robotsOnly || noContentDelta)) {
      contentQualityWarn = true;
      taxonomy.push('weak-content-proof');
      warnings.push(`DB proof is weak content evidence: downloads=${recentDownloads}, bytes=${recentBytes}, robotsOnly=${robotsOnly}, contentDelta=${deltaContent}`);
    }
  }

  if (launchReport) {
    launchReportSupplied = true;
    const results = Array.isArray(launchReport.results) ? launchReport.results : [];
    const failedResults = results.filter(result => !result || result.ok === false);
    const acceptedResults = results.filter(result => result && result.ok === true);
    const failedCount = Number(launchReport?.counts?.failed ?? failedResults.length) || 0;
    const acceptedCount = Number(launchReport?.counts?.ok ?? acceptedResults.length) || 0;
    if (launchReport.status === 'partial' || failedCount > 0) {
      launchReportBlocked = true;
      blockers.push('partial-launch');
      taxonomy.push('partial-launch', 'runtime-error');
      warnings.push(`launch accepted ${acceptedCount} target(s) and failed ${failedCount} target(s)`);
    } else if (launchReport.status && launchReport.status !== 'ok') {
      launchReportBlocked = true;
      blockers.push('launch-failed');
      taxonomy.push('runtime-error');
      warnings.push(`launch status is ${launchReport.status}`);
    }
  }

  if (evidence.watchLogPath) {
    watchLogSupplied = true;
    if (!watchFinal) {
      watchLogBlocked = true;
      blockers.push('watch-log-unparseable');
      taxonomy.push('poll-error');
    } else if (watchFinal.stoppedReason === 'timeout') {
      watchLogBlocked = true;
      blockers.push('watch-timeout');
      taxonomy.push('watch-timeout');
      if (watchFinal.minFetchesMet === false) taxonomy.push('no-new-data');
      warnings.push(`watch timed out with fetched=${watchFinal?.totals?.fetched ?? 'unknown'} and minFetchesMet=${watchFinal.minFetchesMet}`);
      if (watchFinal.kind === 'local' && watchFinal.minFetchesMet === false && (!watchFinal.jobs || watchFinal.jobs.available === false)) {
        blockers.push('job-evidence-unavailable');
        taxonomy.push('poll-error');
        warnings.push(`local job evidence was unavailable during watch (${watchFinal.jobs?.error || 'no job snapshot'})`);
        const acceptedLaunchJobs = Number(watchFinal.launchJobs?.counts?.accepted || 0);
        if (acceptedLaunchJobs > 0) {
          blockers.push('accepted-job-unobservable');
          taxonomy.push('accepted-job-unobservable');
          warnings.push(`launch accepted ${acceptedLaunchJobs} local job(s), but the job endpoint was unobservable during watch`);
        }
      }
    } else if (watchFinal.minFetchesMet === false) {
      watchLogBlocked = true;
      blockers.push('watch-min-fetches-not-met');
      taxonomy.push('no-new-data');
      warnings.push(`watch stopped with minFetchesMet=false (reason=${watchFinal.stoppedReason || 'unknown'})`);
    }
    if (!watchLogBlocked && watchFinal.minHostsMet === false) {
      watchLogBlocked = true;
      blockers.push('watch-host-coverage-not-met');
      taxonomy.push('host-mismatch');
      const missing = Array.isArray(watchFinal.missingLocalTargets) ? watchFinal.missingLocalTargets.join(', ') : '';
      warnings.push(`watch stopped without required local host coverage${missing ? `: ${missing}` : ''}`);
    }
    if (
      watchFinal.stoppedReason === 'local-job-terminal-without-host-coverage'
      || watchFinal.stoppedReason === 'local-host-coverage-not-met'
    ) {
      watchLogBlocked = true;
      blockers.push('watch-host-coverage-not-met');
      taxonomy.push('host-mismatch');
      const covered = Array.isArray(watchFinal.coveredHosts) ? watchFinal.coveredHosts.length : 0;
      warnings.push(`watch stopped with insufficient host coverage (${covered}/${watchFinal.minHosts ?? 'unknown'})`);
    }
    if (!watchLogBlocked && Number(watchFinal.jobPollErrors || 0) > 0) {
      watchLogWarn = true;
      taxonomy.push('poll-error');
      warnings.push(`local job evidence had ${watchFinal.jobPollErrors} poll error(s) before final watch proof`);
    }
    const perTarget = Array.isArray(watchFinal.perTarget) ? watchFinal.perTarget : [];
    const nonTerminalAfterDbProof = perTarget.filter(item => (
      item
      && item.launchOk === true
      && item.dbProofMet === true
      && item.jobTerminal === false
    ));
    if (nonTerminalAfterDbProof.length) {
      watchLogWarn = true;
      taxonomy.push('job-still-running-after-db-proof');
      const hosts = nonTerminalAfterDbProof.map(item => `${item.host || 'unknown'}:${item.jobStatus || 'unknown'}`).join(', ');
      warnings.push(`DB proof succeeded while accepted job(s) were still non-terminal: ${hosts}`);
    }
    const acceptedMissingDb = perTarget.filter(item => (
      item
      && item.launchOk === true
      && item.dbProofMet === false
    ));
    if (acceptedMissingDb.length) {
      watchLogWarn = true;
      taxonomy.push('accepted-job-missing-db-evidence');
      const hosts = acceptedMissingDb.map(item => item.host || 'unknown').join(', ');
      warnings.push(`accepted job(s) had no per-target DB proof: ${hosts}`);
    }
    if (watchFinal.terminalWait?.enabled && watchFinal.terminalWait.outcome && watchFinal.terminalWait.outcome !== 'terminal') {
      watchLogWarn = true;
      taxonomy.push('job-terminal-wait-after-db-proof-incomplete');
      // A single-host run reports a precise outcome directly. The sequential
      // composer collapses mixed per-host outcomes to 'incomplete' but preserves
      // the per-outcome breakdown in `counts`; derive the sub-taxonomy from the
      // non-terminal outcomes so a homogeneous failure mode still classifies.
      let subOutcome = watchFinal.terminalWait.outcome;
      if (subOutcome === 'incomplete' && watchFinal.terminalWait.counts) {
        const nonTerminal = Object.keys(watchFinal.terminalWait.counts)
          .filter(key => key !== 'terminal');
        if (nonTerminal.length === 1) {
          subOutcome = nonTerminal[0];
        }
      }
      if (subOutcome === 'endpoint-unavailable') {
        taxonomy.push('job-terminal-wait-endpoint-unavailable');
      } else if (subOutcome === 'timed-out') {
        taxonomy.push('job-terminal-wait-timed-out');
      }
      warnings.push(`optional terminal wait after DB proof ended as ${watchFinal.terminalWait.outcome}`);
    }
  }

  if (targetFreshness) {
    targetFreshnessSupplied = true;
    if (targetFreshness.available === false) {
      targetFreshnessUnavailable = true;
      warnings.push(`target freshness check unavailable: ${targetFreshness.reason || 'unknown'}`);
    } else if (Number(targetFreshness.likelyAlreadyProcessed || 0) > 0) {
      targetFreshnessWarn = true;
      taxonomy.push('target-already-processed');
      const staleUrls = (targetFreshness.rows || [])
        .filter(row => row.hasResponse)
        .map(row => row.url)
        .slice(0, 3)
        .join(', ');
      warnings.push(`${targetFreshness.likelyAlreadyProcessed}/${targetFreshness.checkedUrls} target URL(s) already have local DB response evidence: ${staleUrls}`);
    }
  }

  return {
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    taxonomy: Array.from(new Set(taxonomy)),
    localSmokeBlocked,
    verificationReportSupplied,
    verificationReportBlocked,
    launchReportSupplied,
    launchReportBlocked,
    watchLogSupplied,
    watchLogBlocked,
    watchLogWarn,
    targetFreshnessSupplied,
    targetFreshnessWarn,
    targetFreshnessUnavailable,
    contentQualityWarn,
    hostCoverageWarn,
  };
}

function scoreCategory(id, status, points, maxPoints, detail) {
  return { id, status, points, maxPoints, detail };
}

function buildScore(options, evidenceClassification) {
  const categories = [];
  categories.push(scoreCategory('intent', 'pass', 2, 2, `${options.hosts.length} host(s), ${options.maxPages} page cap, depth ${options.maxDepth}`));
  categories.push(scoreCategory('preflight', 'pass', 2, 2, 'no-contact packet generation; local execution requires explicit command run'));
  categories.push(scoreCategory('watch-plan', 'pass', 2, 2, `${options.watchTimeoutSec}s watch, min fetches ${options.expectedMinDownloads}, min hosts ${options.expectedMinHosts}`));
  categories.push(scoreCategory('db-proof-plan', 'pass', 2, 2, 'baseline and verification commands are included'));
  categories.push(scoreCategory('queue-deploy-safety', 'pass', 2, 2, 'remote queue/deploy state is not contacted or mutated by this packet'));
  if (evidenceClassification.targetFreshnessSupplied) {
    if (evidenceClassification.targetFreshnessWarn) {
      categories.push(scoreCategory('target-freshness', 'warn', 1, 2, 'one or more target URLs already have local DB response evidence'));
    } else if (evidenceClassification.targetFreshnessUnavailable) {
      categories.push(scoreCategory('target-freshness', 'warn', 1, 2, 'target freshness check was unavailable'));
    } else {
      categories.push(scoreCategory('target-freshness', 'pass', 2, 2, 'target URLs do not have exact-response evidence in the local DB'));
    }
  }

  if (evidenceClassification.localSmokeBlocked) {
    categories.push(scoreCategory('local-smoke-evidence', 'fail', 0, 3, evidenceClassification.blockers.join(', ')));
  } else if (evidenceClassification.taxonomy.includes('stale-proof')) {
    categories.push(scoreCategory('local-smoke-evidence', 'warn', 1, 3, 'tiny local report not supplied yet'));
  } else {
    categories.push(scoreCategory('local-smoke-evidence', 'pass', 3, 3, 'local smoke DB proof supplied and comparison did not block'));
  }

  if (evidenceClassification.verificationReportSupplied) {
    if (evidenceClassification.verificationReportBlocked) {
      categories.push(scoreCategory('run-db-proof', 'fail', 0, 3, 'verification report is blocked'));
    } else {
      categories.push(scoreCategory('run-db-proof', 'pass', 3, 3, 'verification report is clean'));
    }
    if (evidenceClassification.contentQualityWarn) {
      categories.push(scoreCategory('content-quality', 'warn', 1, 2, 'DB proof is zero-byte, robots-only, or has no new content-row delta'));
    } else if (!evidenceClassification.verificationReportBlocked) {
      categories.push(scoreCategory('content-quality', 'pass', 2, 2, 'DB proof includes non-weak content evidence or no weakness was detected'));
    }
    if (evidenceClassification.hostCoverageWarn) {
      categories.push(scoreCategory('host-coverage', 'warn', 1, 2, 'verification report is missing recent evidence for one or more requested hosts'));
    } else if (!evidenceClassification.verificationReportBlocked) {
      categories.push(scoreCategory('host-coverage', 'pass', 2, 2, 'verification report has recent evidence for each requested host'));
    }
  }

  if (evidenceClassification.launchReportSupplied) {
    if (evidenceClassification.launchReportBlocked) {
      categories.push(scoreCategory('launch-result', 'fail', 0, 3, 'launch report has failed targets'));
    } else {
      categories.push(scoreCategory('launch-result', 'pass', 3, 3, 'launch report is clean'));
    }
  }

  if (evidenceClassification.watchLogSupplied) {
    if (evidenceClassification.watchLogBlocked) {
      categories.push(scoreCategory('watch-result', 'fail', 0, 3, 'watch log is blocked'));
    } else if (evidenceClassification.watchLogWarn) {
      categories.push(scoreCategory('watch-result', 'warn', 2, 3, 'watch reached proof but local job evidence had poll errors'));
    } else {
      categories.push(scoreCategory('watch-result', 'pass', 3, 3, 'watch log is clean'));
    }
  }

  const points = categories.reduce((sum, item) => sum + item.points, 0);
  const maxPoints = categories.reduce((sum, item) => sum + item.maxPoints, 0);
  const ratio = maxPoints ? points / maxPoints : 0;
  return {
    points,
    maxPoints,
    percent: Math.round(ratio * 100),
    categories,
  };
}

function nextSafestAction(options, classification, commands) {
  if (classification.blockers.length) {
    return 'inspect the crawl output, DB proof, and comparison blockers before broadening crawl scope';
  }
  if (options.crawlClass === 'tiny-local') {
    return commands.launch.display;
  }
  if (classification.taxonomy.includes('stale-proof')) {
    return 'run the tiny local monitored smoke first, then rebuild this packet with --local-smoke-report tmp/local-smoke-report.json';
  }
  if (classification.taxonomy.includes('target-already-processed')) {
    return 'choose a fresh exact target URL or one-host proof before spending another watched small/medium live run';
  }
  if (classification.hostCoverageWarn || classification.taxonomy.includes('host-mismatch')) {
    return 'rerun with per-host watch coverage or diagnose DB host attribution before broadening crawl scope';
  }
  if (options.crawlClass === 'small-local') {
    return commands.launch.display;
  }
  return commands.dryRun.display;
}

function buildDbProofPlan(options, commands) {
  const baselinePath = `tmp/${options.crawlClass}-baseline.json`;
  const verifyPath = `tmp/${options.crawlClass}-verify.json`;
  const hosts = hostCsv(options.hosts);
  return {
    baseline: commandObject([
      'tools/crawl/monitored-small-crawl.js',
      'baseline',
      '--hosts', hosts,
      '--db', options.dbPath,
      '--out', baselinePath,
      '--json',
    ]),
    verify: commandObject([
      'tools/crawl/monitored-small-crawl.js',
      'verify',
      '--baseline', baselinePath,
      '--since', '<crawl-start-iso>',
      '--until', '<crawl-finish-iso>',
      '--hosts', hosts,
      '--expected-min-downloads', String(options.expectedMinDownloads),
      '--command', commands.launch.display,
      '--profile', options.profile,
      '--db', options.dbPath,
      '--out', verifyPath,
      '--json',
    ]),
    expected: {
      minDownloads: options.expectedMinDownloads,
      minHosts: options.expectedMinHosts,
      hosts: options.hosts,
      proofType: 'DB-owned recent response/content evidence and baseline delta',
    },
  };
}

function slugForArtifact(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'host';
}

function buildSequentialMediumFixtureStrategy(options) {
  if (options.fixturePlan?.preset !== 'medium') return null;
  const token = options.fixturePlan.targetToken || 'untokenized';
  const prefix = `tmp/medium-sequential-${slugForArtifact(token)}`;
  const steps = options.fixturePlan.targets.map((target, index) => {
    const stepOptions = {
      ...options,
      hosts: [target.host],
      urls: [target.url],
      concurrency: 1,
      expectedMinDownloads: 1,
      expectedMinHosts: 1,
    };
    const stepPrefix = `${prefix}-${index + 1}-${slugForArtifact(target.host)}`;
    const launchCommand = buildWatchedLocalRunCommand(stepOptions);
    return {
      index: index + 1,
      host: target.host,
      url: target.url,
      artifactPrefix: stepPrefix,
      expected: {
        minDownloads: 1,
        minHosts: 1,
      },
      launch: launchCommand,
      dbProof: {
        baseline: commandObject([
          'tools/crawl/monitored-small-crawl.js',
          'baseline',
          '--hosts', target.host,
          '--db', options.dbPath,
          '--out', `${stepPrefix}-baseline.json`,
          '--json',
        ]),
        verify: commandObject([
          'tools/crawl/monitored-small-crawl.js',
          'verify',
          '--baseline', `${stepPrefix}-baseline.json`,
          '--since', '<crawl-start-iso>',
          '--until', '<crawl-finish-iso>',
          '--hosts', target.host,
          '--expected-min-downloads', '1',
          '--command', launchCommand.display,
          '--profile', `${options.profile}:sequential-host-${index + 1}`,
          '--db', options.dbPath,
          '--out', `${stepPrefix}-verify.json`,
          '--json',
        ]),
      },
    };
  });

  return {
    mode: 'sequential-per-host-medium-fixture',
    noContact: true,
    reason: 'fallback proof for medium fixture runs when concurrent launch or host coverage is partial',
    requiresFixtureServer: true,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargetsWhenExecuted: false,
      writesLocalDbWhenExecuted: true,
      mutatesRemoteQueue: false,
    },
    steps,
    helper: {
      planCommand: commandObject([
        'tools/crawl/sequential-fixture-proof.js',
        'plan',
        '--fixture-port', String(options.fixturePlan.server.port),
        '--target-token', token,
        '--artifact-prefix', prefix,
        '--local-smoke-report', options.localSmokeReportPath || 'tmp/local-smoke-report.json',
        '--json',
        '--out', `${prefix}-plan.json`,
      ]),
      terminalWaitPlanCommand: commandObject([
        'tools/crawl/sequential-fixture-proof.js',
        'plan',
        '--fixture-port', String(options.fixturePlan.server.port),
        '--target-token', token,
        '--artifact-prefix', prefix,
        '--local-smoke-report', options.localSmokeReportPath || 'tmp/local-smoke-report.json',
        '--wait-for-terminal',
        '--terminal-wait-timeout', '30',
        '--json',
        '--out', `${prefix}-terminal-wait-plan.json`,
      ]),
      executeCommand: commandObject([
        'tools/crawl/sequential-fixture-proof.js',
        'execute',
        '--fixture-port', String(options.fixturePlan.server.port),
        '--target-token', token,
        '--artifact-prefix', prefix,
        '--local-smoke-report', options.localSmokeReportPath || 'tmp/local-smoke-report.json',
        '--json',
        '--out', `${prefix}-result.json`,
      ]),
      terminalWaitExecuteCommand: commandObject([
        'tools/crawl/sequential-fixture-proof.js',
        'execute',
        '--fixture-port', String(options.fixturePlan.server.port),
        '--target-token', token,
        '--artifact-prefix', `${prefix}-terminal-wait`,
        '--local-smoke-report', options.localSmokeReportPath || 'tmp/local-smoke-report.json',
        '--wait-for-terminal',
        '--terminal-wait-timeout', '30',
        '--json',
        '--out', `${prefix}-terminal-wait-result.json`,
      ]),
    },
    compose: {
      launchReportPath: `${prefix}-launch.summary.json`,
      watchLogPath: `${prefix}-watch.summary.log`,
      verificationReportPath: `${prefix}-verify.json`,
      packetPath: `${prefix}-packet.json`,
      comparisonPath: `${prefix}-comparison.json`,
      packetCommand: commandObject([
        'tools/crawl/crawl-packet.js',
        'plan',
        '--fixture-preset', 'medium',
        '--fixture-port', String(options.fixturePlan.server.port),
        '--fixture-target-token', token,
        '--local-smoke-report', options.localSmokeReportPath || 'tmp/local-smoke-report.json',
        '--verification-report', `${prefix}-verify.json`,
        '--launch-report', `${prefix}-launch.summary.json`,
        '--watch-log', `${prefix}-watch.summary.log`,
        '--json',
        '--out', `${prefix}-packet.json`,
      ]),
    },
  };
}

function buildCrawlReliabilityPacket(input = {}) {
  const options = normalizePacketOptions(input);
  const watchedCommand = buildWatchedLocalRunCommand(options);
  const isTiny = options.crawlClass === 'tiny-local';
  const commands = {
    plan: isTiny ? monitoredLocalSmokePlanCommand(options) : addExplainFlag(watchedCommand),
    dryRun: commandObject(['tools/crawl/index.js', options.profile, '--dry-run']),
    launch: isTiny ? monitoredLocalSmokeExecuteCommand(options) : watchedCommand,
  };
  const evidence = loadPacketEvidence(options);
  const evidenceClassification = classifyEvidence(evidence);
  const score = buildScore(options, evidenceClassification);
  const contactsInternetTargetsWhenExecuted = !allTargetsAreLoopback(options.urls);
  const label = evidenceClassification.blockers.length
    ? 'blocked'
    : (evidenceClassification.hostCoverageWarn
      ? `host-partial-${options.crawlClass}`
      : (evidenceClassification.taxonomy.includes('stale-proof')
      ? (options.crawlClass === 'tiny-local' ? 'ready-for-tiny-local' : 'needs-tiny-local-proof')
      : `ready-for-${options.crawlClass}`));
  const dbProofPlan = buildDbProofPlan(options, commands);
  const fixtureServer = options.fixturePlan ? {
    preset: options.fixturePlan.preset,
    targetToken: options.fixturePlan.targetToken,
    port: options.fixturePlan.server.port,
    hosts: options.fixturePlan.hosts,
    urls: options.fixturePlan.urls,
    readyFile: options.fixturePlan.server.readyFile,
    pidFile: options.fixturePlan.server.pidFile,
    planCommand: options.fixturePlan.commands.plan,
    startCommand: options.fixturePlan.commands.start,
    actionPolicy: options.fixturePlan.actionPolicy,
  } : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'crawl-reliability-packet',
    generatedAt: options.generatedAt,
    intent: {
      crawlClass: options.crawlClass,
      label: options.classSpec.label,
      profile: options.profile,
      fixturePreset: options.fixturePlan?.preset || null,
      mode: 'local',
      hosts: options.hosts,
      urls: options.urls,
      caps: {
        maxPages: options.maxPages,
        maxDepth: options.maxDepth,
        concurrency: options.concurrency,
        expectedMinDownloads: options.expectedMinDownloads,
        expectedMinHosts: options.expectedMinHosts,
      },
    },
    preflight: {
      noContact: true,
      planCommand: commands.plan,
      profileDryRunCommand: commands.dryRun,
      localSmokePrerequisite: options.crawlClass === 'tiny-local'
        ? 'this packet is the tiny local monitored smoke plan'
        : 'prefer a verified tiny local smoke report before live small/medium execution',
      fixtureServer,
      sequentialStrategy: buildSequentialMediumFixtureStrategy(options),
    },
    launch: {
      startsCrawlerNow: false,
      command: commands.launch,
      watchRequired: true,
      writesLocalDbWhenExecuted: true,
      contactsInternetTargetsWhenExecuted,
      contactsRemoteCrawler: false,
    },
    watch: {
      required: true,
      intervalMs: options.watchIntervalMs,
      timeoutSec: options.watchTimeoutSec,
      minFetches: options.expectedMinDownloads,
      minHosts: options.expectedMinHosts,
      terminalProof: 'run.js watch result plus monitored-small-crawl DB verification',
    },
    dbProof: dbProofPlan,
    queueDeploy: {
      remoteContactAllowed: false,
      status: 'not-contacted',
      blockerPolicy: 'remote status, deploy, prune, drain, clear, seed, start, and queue maintenance require explicit approval',
    },
    failureTaxonomy: [
      'ready',
      'blocked-busy',
      'approval-missing',
      'no-new-data',
      'partial-launch',
      'partial-persistence',
      'watch-timeout',
      'poll-error',
      'accepted-job-unobservable',
      'target-already-processed',
      'job-still-running-after-db-proof',
      'job-terminal-wait-after-db-proof-incomplete',
      'job-terminal-wait-endpoint-unavailable',
      'job-terminal-wait-timed-out',
      'weak-content-proof',
      'missing-target',
      'stale-proof',
      'host-mismatch',
      'sync-unproven',
      'runtime-error',
    ],
    evidence: {
      localSmokeReportPath: evidence.localSmokeReportPath,
      localSmokeReadiness: evidence.localSmokeReport ? evidence.localSmokeReport.readinessLabel || null : null,
      comparisonPath: evidence.comparisonPath,
      comparisonStablePass: evidence.comparison?.stablePassEvidence?.passed ?? null,
      comparisonLatest: evidence.comparison?.latest || null,
      verificationReportPath: evidence.verificationReportPath,
      verificationReadiness: evidence.verificationReport?.readinessLabel || null,
      verificationDelta: evidence.verificationReport?.database?.delta || null,
      verificationHosts: evidence.verificationReport?.hosts || null,
      verificationRecent: evidence.verificationReport?.recent ? {
        downloads: evidence.verificationReport.recent.downloads,
        success: evidence.verificationReport.recent.success,
        failed: evidence.verificationReport.recent.failed,
        distinctHosts: evidence.verificationReport.recent.distinctHosts,
      } : null,
      launchReportPath: evidence.launchReportPath,
      launchStatus: evidence.launchReport?.status || null,
      launchCounts: evidence.launchReport?.counts || null,
      launchAccepted: Array.isArray(evidence.launchReport?.results)
        ? evidence.launchReport.results
          .filter(result => result && result.ok === true)
          .map(result => ({
            startUrl: result.startUrl || result?.body?.job?.startUrl || null,
            jobId: result.jobId || result?.body?.jobId || result?.body?.job?.id || null,
            attempts: Number(result.attempts || 0) || 0,
          }))
          .slice(0, 5)
        : null,
      launchFailed: Array.isArray(evidence.launchReport?.results)
        ? evidence.launchReport.results
          .filter(result => !result || result.ok === false)
          .map(result => ({
            startUrl: result?.startUrl || null,
            error: result?.error || null,
            attempts: Number(result?.attempts || 0) || 0,
            retryable: result?.retryable == null ? null : Boolean(result.retryable),
          }))
          .slice(0, 5)
        : null,
      watchLogPath: evidence.watchLogPath,
      watchFinal: evidence.watchFinal ? {
        stoppedReason: evidence.watchFinal.stoppedReason || null,
        kind: evidence.watchFinal.kind || null,
        totals: evidence.watchFinal.totals || null,
        minFetches: evidence.watchFinal.minFetches ?? null,
        minFetchesMet: evidence.watchFinal.minFetchesMet ?? null,
        minHosts: evidence.watchFinal.minHosts ?? null,
        minHostsMet: evidence.watchFinal.minHostsMet ?? null,
        coveredHosts: evidence.watchFinal.coveredHosts || [],
        missingLocalTargets: evidence.watchFinal.missingLocalTargets || [],
        jobPollErrors: evidence.watchFinal.jobPollErrors ?? null,
        jobs: evidence.watchFinal.jobs ? {
          available: evidence.watchFinal.jobs.available !== false,
          error: evidence.watchFinal.jobs.error || null,
          counts: evidence.watchFinal.jobs.counts || null,
        } : null,
        terminalWait: evidence.watchFinal.terminalWait ? {
          enabled: Boolean(evidence.watchFinal.terminalWait.enabled),
          timeoutSec: evidence.watchFinal.terminalWait.timeoutSec ?? null,
          jobPollTimeoutMs: evidence.watchFinal.terminalWait.jobPollTimeoutMs ?? null,
          startedAt: evidence.watchFinal.terminalWait.startedAt || null,
          finishedAt: evidence.watchFinal.terminalWait.finishedAt || null,
          elapsedMs: evidence.watchFinal.terminalWait.elapsedMs ?? null,
          jobPolls: evidence.watchFinal.terminalWait.jobPolls ?? null,
          jobPollErrors: evidence.watchFinal.terminalWait.jobPollErrors ?? null,
          endpointResponded: evidence.watchFinal.terminalWait.endpointResponded ?? null,
          outcome: evidence.watchFinal.terminalWait.outcome || null,
          reason: evidence.watchFinal.terminalWait.reason || null,
        } : null,
        launchJobs: evidence.watchFinal.launchJobs ? {
          source: evidence.watchFinal.launchJobs.source || null,
          available: evidence.watchFinal.launchJobs.available !== false,
          counts: evidence.watchFinal.launchJobs.counts || null,
          items: Array.isArray(evidence.watchFinal.launchJobs.items)
            ? evidence.watchFinal.launchJobs.items.slice(0, 5)
            : [],
        } : null,
        perTarget: Array.isArray(evidence.watchFinal.perTarget)
          ? evidence.watchFinal.perTarget.slice(0, 10).map(item => ({
            index: item?.index ?? null,
            host: item?.host || null,
            url: item?.url || null,
            launchOk: item?.launchOk == null ? null : Boolean(item.launchOk),
            jobId: item?.jobId || null,
            jobStatus: item?.jobStatus || null,
            jobStatusSource: item?.jobStatusSource || null,
            jobObserved: item?.jobObserved == null ? null : Boolean(item.jobObserved),
            jobTerminal: item?.jobTerminal == null ? null : Boolean(item.jobTerminal),
            terminalState: item?.terminalState || null,
            watchStoppedReason: item?.watchStoppedReason || null,
            minHostsMet: item?.minHostsMet ?? null,
            dbDownloads: Number(item?.dbDownloads || 0),
            dbSuccess: Number(item?.dbSuccess || 0),
            dbContentDelta: Number(item?.dbContentDelta || 0),
            dbProofMet: item?.dbProofMet == null ? null : Boolean(item.dbProofMet),
            blockers: Array.isArray(item?.blockers) ? item.blockers.slice(0, 5) : [],
            warnings: Array.isArray(item?.warnings) ? item.warnings.slice(0, 5) : [],
          }))
          : [],
      } : null,
      targetFreshness: evidence.targetFreshness ? {
        available: evidence.targetFreshness.available !== false,
        reason: evidence.targetFreshness.reason || null,
        checkedUrls: evidence.targetFreshness.checkedUrls ?? null,
        likelyAlreadyProcessed: evidence.targetFreshness.likelyAlreadyProcessed ?? null,
        recentlyFetched: evidence.targetFreshness.recentlyFetched ?? null,
        rows: Array.isArray(evidence.targetFreshness.rows)
          ? evidence.targetFreshness.rows.slice(0, 5).map(row => ({
            url: row.url || null,
            host: row.host || null,
            hasResponse: Boolean(row.hasResponse),
            httpStatus: row.httpStatus ?? null,
            latestFetchedAt: row.latestFetchedAt || null,
            recentlyFetched: Boolean(row.recentlyFetched),
            recommendation: row.recommendation || null,
          }))
          : [],
      } : null,
      hostProof: buildHostProof(options, evidence),
    },
    classification: {
      label,
      primary: evidenceClassification.blockers[0] || (evidenceClassification.taxonomy.includes('stale-proof') ? 'stale-proof' : 'ready'),
      taxonomy: evidenceClassification.taxonomy.length ? evidenceClassification.taxonomy : ['ready'],
      blockers: evidenceClassification.blockers,
      warnings: evidenceClassification.warnings,
      nextSafestAction: nextSafestAction(options, evidenceClassification, commands),
    },
    score,
    actionPolicy: {
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      contactsInternetTargetsWhenExecuted,
      writesLocalDb: false,
      writesLocalDbWhenExecuted: true,
      deploysRemote: false,
      forceDeploys: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      seedsRemote: false,
      changesCollectBehavior: false,
    },
  };
}

function normalizePacketPaths(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap(item => String(item || '').split(','))
    .map(item => item.trim())
    .filter(Boolean);
}

function readPacketFile(filePath) {
  const packet = readBoundedJson(filePath, 'crawl packet');
  if (packet?.mode !== 'crawl-reliability-packet') {
    throw new Error(`${filePath} is not a crawl reliability packet`);
  }
  return packet;
}

function summarizePacketForComparison(packet, sourcePath) {
  const hostProof = Array.isArray(packet?.evidence?.hostProof) ? packet.evidence.hostProof : [];
  const requestedHosts = Array.isArray(packet?.intent?.hosts) ? packet.intent.hosts : [];
  const launchAcceptedHosts = hostProof
    .filter(row => Number(row?.launch?.accepted || 0) > 0)
    .map(row => row.host);
  const launchFailedHosts = hostProof
    .filter(row => Number(row?.launch?.failed || 0) > 0)
    .map(row => row.host);
  const dbCoveredHosts = hostProof
    .filter(row => Number(row?.db?.downloads || 0) > 0 || Number(row?.db?.success || 0) > 0)
    .map(row => row.host);
  const dbMissingHosts = requestedHosts.filter(host => !dbCoveredHosts.some(covered => hostMatches(host, covered)));
  const blockers = Array.isArray(packet?.classification?.blockers) ? packet.classification.blockers : [];
  const taxonomy = Array.isArray(packet?.classification?.taxonomy) ? packet.classification.taxonomy : [];
  return {
    sourcePath,
    generatedAt: packet.generatedAt || null,
    crawlClass: packet?.intent?.crawlClass || null,
    fixturePreset: packet?.intent?.fixturePreset || null,
    label: packet?.classification?.label || null,
    primary: packet?.classification?.primary || null,
    score: {
      points: Number(packet?.score?.points || 0),
      maxPoints: Number(packet?.score?.maxPoints || 0),
      percent: Number(packet?.score?.percent || 0),
    },
    blockers,
    taxonomy,
    hostCoverage: {
      requested: requestedHosts,
      launchAccepted: launchAcceptedHosts,
      launchFailed: launchFailedHosts,
      dbCovered: dbCoveredHosts,
      dbMissing: dbMissingHosts,
    },
    watch: {
      stoppedReason: packet?.evidence?.watchFinal?.stoppedReason || null,
      minHosts: packet?.evidence?.watchFinal?.minHosts ?? null,
      minHostsMet: packet?.evidence?.watchFinal?.minHostsMet ?? null,
      jobPollErrors: packet?.evidence?.watchFinal?.jobPollErrors ?? null,
    },
  };
}

function chooseBestPacketSummary(summaries) {
  return summaries.slice().sort((a, b) => {
    const aBlocked = a.blockers.length > 0 ? 1 : 0;
    const bBlocked = b.blockers.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    if (b.score.percent !== a.score.percent) return b.score.percent - a.score.percent;
    return b.hostCoverage.dbCovered.length - a.hostCoverage.dbCovered.length;
  })[0] || null;
}

function buildCrawlPacketComparison(input = {}) {
  const packetPaths = normalizePacketPaths(input.packet || input.packets);
  if (packetPaths.length < 1) {
    throw new Error('compare requires at least one --packet path');
  }
  const packets = packetPaths.map(filePath => summarizePacketForComparison(readPacketFile(filePath), filePath));
  const best = chooseBestPacketSummary(packets);
  const latest = packets[packets.length - 1] || null;
  const blockedCount = packets.filter(packet => packet.blockers.length > 0).length;
  const passCount = packets.length - blockedCount;
  const first = packets[0] || null;
  const scoreDeltaFromFirst = first && latest ? latest.score.percent - first.score.percent : 0;
  const dbHostDeltaFromFirst = first && latest
    ? latest.hostCoverage.dbCovered.length - first.hostCoverage.dbCovered.length
    : 0;
  const diagnostics = [];
  if (first && latest && latest.sourcePath !== first.sourcePath) {
    diagnostics.push(`latest score delta from first packet: ${scoreDeltaFromFirst}`);
    diagnostics.push(`latest DB host coverage delta from first packet: ${dbHostDeltaFromFirst}`);
  }
  for (const packet of packets) {
    if (packet.blockers.length) {
      diagnostics.push(`${packet.sourcePath} blocked: ${packet.blockers.join(', ')}`);
    }
    if (packet.hostCoverage.dbMissing.length) {
      diagnostics.push(`${packet.sourcePath} missing DB hosts: ${packet.hostCoverage.dbMissing.join(', ')}`);
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'crawl-packet-comparison',
    generatedAt: toIso(input.generatedAt || input['generated-at']),
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      mutatesRemoteQueue: false,
    },
    comparison: {
      packetCount: packets.length,
      passCount,
      blockedCount,
      bestPacket: best?.sourcePath || null,
      latestPacket: latest?.sourcePath || null,
      latestScoreDeltaFromFirst: scoreDeltaFromFirst,
      latestDbHostDeltaFromFirst: dbHostDeltaFromFirst,
    },
    packets,
    diagnostics,
    nextSafestAction: blockedCount === packets.length
      ? 'keep medium live blocked and inspect per-host launch/watch/DB evidence before broadening'
      : 'prefer the highest-scoring unblocked packet before broadening medium proof scope',
  };
}

function renderCrawlPacketComparisonText(comparison) {
  const lines = [
    'Crawl Packet Comparison',
    `Packets: ${comparison.comparison.packetCount}`,
    `Pass/blocked: pass=${comparison.comparison.passCount} blocked=${comparison.comparison.blockedCount}`,
    `Best: ${comparison.comparison.bestPacket || 'none'}`,
    `Latest score delta from first: ${comparison.comparison.latestScoreDeltaFromFirst}`,
    `Latest DB host delta from first: ${comparison.comparison.latestDbHostDeltaFromFirst}`,
  ];
  for (const packet of comparison.packets) {
    lines.push(`- ${packet.sourcePath}: ${packet.label} score=${packet.score.percent}% dbHosts=${packet.hostCoverage.dbCovered.length}/${packet.hostCoverage.requested.length} blockers=${packet.blockers.join(',') || 'none'}`);
  }
  if (comparison.diagnostics.length) {
    lines.push('Diagnostics:');
    for (const item of comparison.diagnostics) lines.push(`- ${item}`);
  }
  lines.push(`Next: ${comparison.nextSafestAction}`);
  lines.push('No-action policy: this comparison reads saved packets only and does not start crawlers, contact targets, write DB rows, or mutate queues.');
  return `${lines.join('\n')}\n`;
}

function writeComparisonOut(outPath, comparison, pretty = false) {
  if (!outPath) return;
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(comparison, null, pretty ? 2 : 0)}\n`);
}

function sumPacketDbDelta(packet) {
  const hostProof = Array.isArray(packet?.evidence?.hostProof) ? packet.evidence.hostProof : [];
  return hostProof.reduce((acc, row) => ({
    downloads: acc.downloads + Number(row?.db?.downloads || 0),
    success: acc.success + Number(row?.db?.success || 0),
    content: acc.content + Number(row?.db?.content || 0),
  }), { downloads: 0, success: 0, content: 0 });
}

function diffTaxonomy(smallList, mediumList) {
  const small = Array.isArray(smallList) ? smallList : [];
  const medium = Array.isArray(mediumList) ? mediumList : [];
  const smallSet = new Set(small);
  const mediumSet = new Set(medium);
  return {
    shared: small.filter(item => mediumSet.has(item)),
    onlySmall: small.filter(item => !mediumSet.has(item)),
    onlyMedium: medium.filter(item => !smallSet.has(item)),
  };
}

function summarizePacketCadenceRung(packet, sourcePath) {
  const summary = summarizePacketForComparison(packet, sourcePath);
  const db = sumPacketDbDelta(packet);
  return {
    sourcePath,
    crawlClass: summary.crawlClass,
    fixturePreset: summary.fixturePreset,
    label: summary.label,
    score: summary.score,
    db,
    hostCoverage: {
      requested: summary.hostCoverage.requested.length,
      dbCovered: summary.hostCoverage.dbCovered.length,
      dbMissing: summary.hostCoverage.dbMissing.length,
    },
    taxonomy: summary.taxonomy,
    blockers: summary.blockers,
  };
}

function buildPacketCadenceComparison(input = {}) {
  const smallPath = normalizePacketPaths(input.small || input.smallPacket || input['small-packet'])[0];
  const mediumPath = normalizePacketPaths(input.medium || input.mediumPacket || input['medium-packet'])[0];
  if (!smallPath) {
    throw new Error('cadence requires --small <packet path>');
  }
  if (!mediumPath) {
    throw new Error('cadence requires --medium <packet path>');
  }
  const small = summarizePacketCadenceRung(readPacketFile(smallPath), smallPath);
  const medium = summarizePacketCadenceRung(readPacketFile(mediumPath), mediumPath);
  const taxonomy = diffTaxonomy(small.taxonomy, medium.taxonomy);
  const deltas = {
    scorePercent: medium.score.percent - small.score.percent,
    scorePoints: medium.score.points - small.score.points,
    dbDownloads: medium.db.downloads - small.db.downloads,
    dbSuccess: medium.db.success - small.db.success,
    dbContent: medium.db.content - small.db.content,
    hostsRequested: medium.hostCoverage.requested - small.hostCoverage.requested,
    hostsDbCovered: medium.hostCoverage.dbCovered - small.hostCoverage.dbCovered,
  };
  const cadenceConsistent = deltas.scorePercent === 0
    && taxonomy.onlySmall.length === 0
    && taxonomy.onlyMedium.length === 0
    && small.blockers.length === 0
    && medium.blockers.length === 0;
  const diagnostics = [];
  if (deltas.scorePercent !== 0) {
    diagnostics.push(`score percent differs by ${deltas.scorePercent} (small=${small.score.percent}% medium=${medium.score.percent}%)`);
  }
  if (taxonomy.onlySmall.length) {
    diagnostics.push(`taxonomy only in small: ${taxonomy.onlySmall.join(', ')}`);
  }
  if (taxonomy.onlyMedium.length) {
    diagnostics.push(`taxonomy only in medium: ${taxonomy.onlyMedium.join(', ')}`);
  }
  if (small.blockers.length) {
    diagnostics.push(`small blocked: ${small.blockers.join(', ')}`);
  }
  if (medium.blockers.length) {
    diagnostics.push(`medium blocked: ${medium.blockers.join(', ')}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'crawl-packet-cadence-comparison',
    generatedAt: toIso(input.generatedAt || input['generated-at']),
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      mutatesRemoteQueue: false,
    },
    small,
    medium,
    deltas,
    taxonomy,
    cadenceConsistent,
    diagnostics,
    nextSafestAction: cadenceConsistent
      ? 'small and medium rungs share cadence (same score and taxonomy); proceed with the gated medium sequential proof'
      : 'reconcile the small/medium cadence differences above before broadening medium proof scope',
  };
}

function renderPacketCadenceComparisonText(comparison) {
  const { small, medium, deltas, taxonomy } = comparison;
  const lines = [
    'Crawl Packet Cadence Comparison (small vs medium)',
    `Small: ${small.sourcePath} class=${small.crawlClass} score=${small.score.percent}% label=${small.label} hostsDb=${small.hostCoverage.dbCovered}/${small.hostCoverage.requested} db(d/s/c)=${small.db.downloads}/${small.db.success}/${small.db.content}`,
    `Medium: ${medium.sourcePath} class=${medium.crawlClass} score=${medium.score.percent}% label=${medium.label} hostsDb=${medium.hostCoverage.dbCovered}/${medium.hostCoverage.requested} db(d/s/c)=${medium.db.downloads}/${medium.db.success}/${medium.db.content}`,
    `Deltas (medium - small): scorePercent=${deltas.scorePercent} dbDownloads=${deltas.dbDownloads} dbSuccess=${deltas.dbSuccess} dbContent=${deltas.dbContent} hostsRequested=${deltas.hostsRequested} hostsDbCovered=${deltas.hostsDbCovered}`,
    `Taxonomy shared=[${taxonomy.shared.join(',') || 'none'}] onlySmall=[${taxonomy.onlySmall.join(',') || 'none'}] onlyMedium=[${taxonomy.onlyMedium.join(',') || 'none'}]`,
    `Cadence consistent: ${comparison.cadenceConsistent ? 'yes' : 'no'}`,
  ];
  if (comparison.diagnostics.length) {
    lines.push('Diagnostics:');
    for (const item of comparison.diagnostics) lines.push(`- ${item}`);
  }
  lines.push(`Next: ${comparison.nextSafestAction}`);
  lines.push('No-action policy: this comparison reads two saved packets only and does not start crawlers, contact targets, write DB rows, or mutate queues.');
  return `${lines.join('\n')}\n`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cadenceComparisonFromInput(input = {}) {
  const cadencePath = normalizePacketPaths(input.cadence || input.cadenceComparison || input['cadence-comparison'])[0];
  if (cadencePath) {
    const saved = readBoundedJson(cadencePath, 'cadence comparison');
    if (saved?.mode !== 'crawl-packet-cadence-comparison') {
      throw new Error(`${cadencePath} is not a crawl-packet-cadence-comparison artifact`);
    }
    return saved;
  }
  return buildPacketCadenceComparison(input);
}

function cadenceRungCard(rung, name) {
  return {
    rung: name,
    label: rung.label,
    crawlClass: rung.crawlClass,
    scorePercent: Number(rung?.score?.percent || 0),
    scorePoints: Number(rung?.score?.points || 0),
    scoreMaxPoints: Number(rung?.score?.maxPoints || 0),
    db: {
      downloads: Number(rung?.db?.downloads || 0),
      success: Number(rung?.db?.success || 0),
      content: Number(rung?.db?.content || 0),
    },
    hostCoverage: {
      requested: Number(rung?.hostCoverage?.requested || 0),
      dbCovered: Number(rung?.hostCoverage?.dbCovered || 0),
      dbMissing: Number(rung?.hostCoverage?.dbMissing || 0),
    },
    taxonomy: Array.isArray(rung?.taxonomy) ? rung.taxonomy.slice() : [],
    blockers: Array.isArray(rung?.blockers) ? rung.blockers.slice() : [],
  };
}

function buildPacketComparisonCard(input = {}) {
  const comparison = cadenceComparisonFromInput(input);
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'crawl-packet-comparison-card',
    generatedAt: toIso(input.generatedAt || input['generated-at']),
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemoteCrawler: false,
      contactsInternetTargets: false,
      writesLocalDb: false,
      mutatesRemoteQueue: false,
    },
    title: 'Small vs Medium Reliability Cadence',
    rungs: [
      cadenceRungCard(comparison.small, 'small'),
      cadenceRungCard(comparison.medium, 'medium'),
    ],
    verdict: {
      cadenceConsistent: Boolean(comparison.cadenceConsistent),
      diagnostics: Array.isArray(comparison.diagnostics) ? comparison.diagnostics.slice() : [],
      nextSafestAction: comparison.nextSafestAction || null,
    },
    source: {
      small: comparison?.small?.sourcePath || null,
      medium: comparison?.medium?.sourcePath || null,
    },
  };
}

function renderPacketComparisonCardText(card) {
  const verdictMark = card.verdict.cadenceConsistent ? 'CONSISTENT' : 'DIVERGENT';
  const lines = [];
  lines.push(`+-- ${card.title} --+`);
  lines.push(`| verdict: ${verdictMark}`);
  for (const rung of card.rungs) {
    lines.push(`| ${String(rung.rung).padEnd(6)} ${String(rung.scorePercent).padStart(3)}% ${rung.label} db(d/s/c)=${rung.db.downloads}/${rung.db.success}/${rung.db.content} hostsDb=${rung.hostCoverage.dbCovered}/${rung.hostCoverage.requested} taxonomy=[${rung.taxonomy.join(',') || 'none'}] blockers=[${rung.blockers.join(',') || 'none'}]`);
  }
  if (card.verdict.diagnostics.length) {
    lines.push('| diagnostics:');
    for (const item of card.verdict.diagnostics) lines.push(`|   - ${item}`);
  }
  lines.push(`| next: ${card.verdict.nextSafestAction}`);
  lines.push(`+${'-'.repeat(card.title.length + 8)}+`);
  lines.push('No-action policy: this card reads saved packet/cadence artifacts only and does not start crawlers, contact targets, write DB rows, or mutate queues.');
  return `${lines.join('\n')}\n`;
}

function renderPacketComparisonCardHtml(card) {
  const verdictClass = card.verdict.cadenceConsistent ? 'consistent' : 'divergent';
  const verdictLabel = card.verdict.cadenceConsistent ? 'Cadence consistent' : 'Cadence divergent';
  const rungRows = card.rungs.map(rung => `        <tr>
          <td class="rung">${escapeHtml(rung.rung)}</td>
          <td class="score">${escapeHtml(rung.scorePercent)}%</td>
          <td class="label">${escapeHtml(rung.label)}</td>
          <td class="db">${escapeHtml(rung.db.downloads)}/${escapeHtml(rung.db.success)}/${escapeHtml(rung.db.content)}</td>
          <td class="hosts">${escapeHtml(rung.hostCoverage.dbCovered)}/${escapeHtml(rung.hostCoverage.requested)}</td>
          <td class="taxonomy">${escapeHtml(rung.taxonomy.join(', ') || 'none')}</td>
          <td class="blockers">${escapeHtml(rung.blockers.join(', ') || 'none')}</td>
        </tr>`).join('\n');
  const diagnostics = card.verdict.diagnostics.length
    ? `      <ul class="diagnostics">\n${card.verdict.diagnostics.map(item => `        <li>${escapeHtml(item)}</li>`).join('\n')}\n      </ul>`
    : '      <p class="diagnostics empty">No divergence diagnostics.</p>';
  return `<section class="crawl-packet-comparison-card ${verdictClass}" data-mode="crawl-packet-comparison-card">
  <header>
    <h3>${escapeHtml(card.title)}</h3>
    <span class="verdict ${verdictClass}">${escapeHtml(verdictLabel)}</span>
  </header>
  <table>
    <thead>
      <tr><th>Rung</th><th>Score</th><th>Label</th><th>DB d/s/c</th><th>Hosts DB</th><th>Taxonomy</th><th>Blockers</th></tr>
    </thead>
    <tbody>
${rungRows}
    </tbody>
  </table>
${diagnostics}
  <p class="next">${escapeHtml(card.verdict.nextSafestAction)}</p>
  <p class="policy">Read-only: reads saved artifacts only; no crawl, network, DB write, or queue mutation.</p>
</section>
`;
}

function renderCrawlReliabilityPacketText(packet) {
  const lines = [
    'Crawl Reliability Packet',
    `Class: ${packet.intent.crawlClass}`,
    `Profile: ${packet.intent.profile}`,
    `Hosts: ${packet.intent.hosts.join(', ')}`,
    `Score: ${packet.score.points}/${packet.score.maxPoints} (${packet.score.percent}%)`,
    `Readiness: ${packet.classification.label}`,
    `Plan: ${packet.preflight.planCommand.display}`,
    `Launch: ${packet.launch.command.display}`,
    `DB verify: ${packet.dbProof.verify.display}`,
    `Queue/deploy: ${packet.queueDeploy.status}; ${packet.queueDeploy.blockerPolicy}`,
  ];
  if (packet.classification.blockers.length) {
    lines.push('Blockers:');
    for (const blocker of packet.classification.blockers) lines.push(`- ${blocker}`);
  }
  if (packet.classification.warnings.length) {
    lines.push('Warnings:');
    for (const warning of packet.classification.warnings) lines.push(`- ${warning}`);
  }
  lines.push(`Next: ${packet.classification.nextSafestAction}`);
  lines.push('No-action policy: this packet does not start crawlers, contact the remote crawler, write DB rows, deploy, prune, drain, clear, seed, or change collect behavior.');
  return `${lines.join('\n')}\n`;
}

function writePacketOut(outPath, packet, pretty = false) {
  if (!outPath) return;
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(packet, null, pretty ? 2 : 0)}\n`);
}

module.exports = {
  CRAWL_CLASSES,
  SCHEMA_VERSION,
  buildCrawlPacketComparison,
  buildPacketCadenceComparison,
  buildCrawlReliabilityPacket,
  normalizePacketOptions,
  renderCrawlPacketComparisonText,
  renderPacketCadenceComparisonText,
  renderCrawlReliabilityPacketText,
  buildPacketComparisonCard,
  renderPacketComparisonCardText,
  renderPacketComparisonCardHtml,
  summarizeTargetFreshnessRows,
  writeComparisonOut,
  writePacketOut,
};
