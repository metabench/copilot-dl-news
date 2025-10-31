#!/usr/bin/env node

'use strict';

/**
 * Place Hub Guessing CLI Tool
 * 
 * Thin wrapper around orchestration layer for place hub discovery.
 * Handles: CLI argument parsing, output formatting, progress display.
 * Contains NO business logic - delegates to orchestration layer.
 */

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../utils/project-root');
const { CliFormatter } = require('../utils/CliFormatter');
const { BatchLoader } = require('./cli/BatchLoader');
const { ArgumentNormalizer } = require('./cli/ArgumentNormalizer');
const { ReportWriter } = require('./cli/ReportWriter');
const { guessPlaceHubsForDomain, guessPlaceHubsBatch } = require('../orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../orchestration/dependencies');

const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_DECISION_HISTORY = 200;

/**
 * Backward compatibility wrapper for tests and legacy usage
 * Maps old interface to new orchestration layer
 */
async function guessPlaceHubs(options = {}, legacyDeps = {}) {
  // Extract database path if provided
  const dbPath = options.dbPath || resolveDbPath(null);
  
  // Create a logger that proxies to provided legacy logger (defaults to no-op)
  const legacyLogger = legacyDeps.logger || {};
  const logger = {
    info: typeof legacyLogger.info === 'function'
      ? (message, ...args) => legacyLogger.info(message, ...args)
      : () => {},
    warn: typeof legacyLogger.warn === 'function'
      ? (message, ...args) => legacyLogger.warn(message, ...args)
      : () => {},
    error: typeof legacyLogger.error === 'function'
      ? (message, ...args) => legacyLogger.error(message, ...args)
      : () => {}
  };
  
  // Create dependencies manually to avoid factory function creating console logger
  const { ensureDb } = require('../db/sqlite/ensureDb');
  const { createSQLiteDatabase } = require('../db/sqlite');
  const { createGuessPlaceHubsQueries } = require('../db/sqlite/v1/queries/guessPlaceHubsQueries');
  const { CountryHubGapAnalyzer } = require('../services/CountryHubGapAnalyzer');
  const { RegionHubGapAnalyzer } = require('../services/RegionHubGapAnalyzer');
  const { CityHubGapAnalyzer } = require('../services/CityHubGapAnalyzer');
  const { TopicHubGapAnalyzer } = require('../services/TopicHubGapAnalyzer');
  const HubValidator = require('../hub-validation/HubValidator');
  
  const db = ensureDb(dbPath);
  const newsDb = createSQLiteDatabase(dbPath);
  const queries = createGuessPlaceHubsQueries(db);
  
  const analyzers = {
    country: new CountryHubGapAnalyzer({ db, logger }),
    region: new RegionHubGapAnalyzer({ db, logger }),
    city: new CityHubGapAnalyzer({ db, logger }),
    topic: new TopicHubGapAnalyzer({ db, logger })
  };
  
  const validator = new HubValidator(db);
  const fetchFn = typeof legacyDeps.fetchFn === 'function'
    ? legacyDeps.fetchFn
    : async (...fetchArgs) => {
        const { default: fetch } = await import('node-fetch');
        return fetch(...fetchArgs);
      };
  const now = legacyDeps.now || (() => new Date());
  
  const deps = {
    db,
    newsDb,
    logger,
    fetchFn,
    now,
    queries,
    analyzers,
    validator,
    stores: {
      candidates: null, // Not needed for basic functionality
      fetchRecorder: null // Not needed for basic functionality
    }
  };
  
  // Map options to new format
  const orchestrationOptions = {
    domain: options.domain,
    scheme: options.scheme || 'https',
    kinds: options.kinds || ['country'],
    limit: options.limit,
    patternsPerPlace: options.patternsPerPlace || 3,
    apply: options.apply || false,
    maxAgeDays: options.maxAgeDays !== undefined ? options.maxAgeDays : 7,
    refresh404Days: options.refresh404Days !== undefined ? options.refresh404Days : 180,
    retry4xxDays: options.retry4xxDays !== undefined ? options.retry4xxDays : 7,
    verbose: options.verbose || false,
    readinessTimeoutMs: options.readinessTimeoutMs
  };
  
  // Call new orchestration function
  try {
    return await guessPlaceHubsForDomain(orchestrationOptions, deps);
  } finally {
    // Close database connections to avoid EBUSY errors in tests
    try { if (deps.db && typeof deps.db.close === 'function') deps.db.close(); } catch (_) {}
    try { if (deps.newsDb && typeof deps.newsDb.close === 'function') deps.newsDb.close(); } catch (_) {}
  }
}

function writeReportFile(payload, options = {}) {
  if (!options?.emitReport) {
    return { skipped: true };
  }

  const targetPath = options.reportPath;
  if (!targetPath) {
    return { error: 'Report path could not be resolved. Provide a file or directory to --emit-report.' };
  }

  const targetDir = options.reportDirectory || path.dirname(targetPath);

  try {
    if (targetDir) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  } catch (error) {
    return { error: `Failed to ensure report directory at ${targetDir}: ${error?.message || error}` };
  }

  const savedAt = new Date().toISOString();
  const payloadForWrite = {
    ...payload,
    report: {
      ...(payload.report || {}),
      requested: true,
      targetPath,
      directory: targetDir,
      written: true,
      savedAt
    }
  };

  try {
    fs.writeFileSync(targetPath, `${JSON.stringify(payloadForWrite, null, 2)}\n`, 'utf8');
    return {
      path: targetPath,
      directory: targetDir,
      savedAt,
      payload: payloadForWrite
    };
  } catch (error) {
    return { error: `Failed to write report at ${targetPath}: ${error?.message || error}` };
  }
}



function resolveDbPath(dbPath) {
  if (dbPath) {
    return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  }
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

function normalizeDomain(input, scheme = 'https') {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.includes('://')) {
    const parsed = new URL(trimmed);
    return {
      host: parsed.hostname.toLowerCase(),
      scheme: parsed.protocol.replace(':', ''),
      base: `${parsed.protocol}//${parsed.host}`
    };
  }
  const cleanScheme = scheme === 'http' ? 'http' : 'https';
  return {
    host: trimmed.toLowerCase(),
    scheme: cleanScheme,
    base: `${cleanScheme}://${trimmed.toLowerCase()}`
  };
}

function extractTitle(html) {
  if (!html) return null;
  const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, ' ').slice(0, 300);
}

function applyScheme(url, targetScheme) {
  if (!url) return url;
  if (!targetScheme || targetScheme === 'https') return url;
  return url.replace(/^https:\/\//i, `${targetScheme}://`);
}

function computeAgeMs(row, nowUtcMs) {
  if (!row) return Number.POSITIVE_INFINITY;
  const ts = row.fetched_at || row.request_started_at;
  if (!ts) return Number.POSITIVE_INFINITY;
  const time = new Date(ts).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return nowUtcMs - time;
}

function buildEvidence(place, patternSource, status, extra = {}) {
  return JSON.stringify({
    source: 'guess-place-hubs',
    patternSource,
    status,
    place,
    ...extra
  });
}

function extractPredictionSignals(predictionSource) {
  if (!predictionSource) return null;
  if (typeof predictionSource !== 'object') {
    return { value: String(predictionSource) };
  }
  const allowedKeys = ['pattern', 'score', 'confidence', 'strategy', 'exampleUrl', 'weight'];
  const extracted = {};
  for (const key of allowedKeys) {
    if (predictionSource[key] != null) {
      extracted[key] = predictionSource[key];
    }
  }
  if (Object.keys(extracted).length === 0) {
    return { raw: predictionSource }; // fallback if structure unexpected
  }
  return extracted;
}


async function fetchUrl(url, fetchFn, { logger, timeoutMs = 15000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    try { controller.abort(); } catch (_) {}
  }, timeoutMs);
  const started = Date.now();
  const requestStartedIso = new Date(started).toISOString();
  const requestMethod = typeof method === 'string' && method.trim()
    ? method.trim().toUpperCase()
    : 'GET';

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      method: requestMethod,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GuessPlaceHubs/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    const finished = Date.now();
    clearTimeout(timeout);
    const finalUrl = response.url || url;
    let body = '';
    let bytesDownloaded = 0;
    if (requestMethod !== 'HEAD') {
      try {
        body = await response.text();
        bytesDownloaded = Buffer.byteLength(body, 'utf8');
      } catch (err) {
        logger?.warn?.(`[guess-place-hubs] Failed to read body for ${finalUrl}: ${err.message || err}`);
      }
    }
    const headers = response.headers || { get: () => null };
    const contentType = headers.get ? headers.get('content-type') : null;
    const contentLengthHeader = headers.get ? headers.get('content-length') : null;
    const contentLength = contentLengthHeader != null ? Number(contentLengthHeader) : null;

    return {
      ok: response.ok,
      status: response.status,
      finalUrl,
      body,
      metrics: {
        request_started_at: requestStartedIso,
        fetched_at: new Date(finished).toISOString(),
        bytes_downloaded: bytesDownloaded,
        content_type: contentType || null,
        content_length: Number.isFinite(contentLength) ? contentLength : null,
        total_ms: finished - started,
        download_ms: finished - started
      },
      requestMethod
    };
  } catch (error) {
    clearTimeout(timeout);
    throw Object.assign(new Error(error.message || String(error)), {
      kind: error.name === 'AbortError' ? 'timeout' : 'network',
      cause: error
    });
  }
}

function createFetchRow(result, fallbackHost) {
  const metrics = result.metrics || {};
  const host = (() => {
    try {
      return new URL(result.finalUrl).hostname.toLowerCase();
    } catch (_) {
      return fallbackHost;
    }
  })();

  return {
    url: result.finalUrl,
    request_started_at: metrics.request_started_at,
    fetched_at: metrics.fetched_at,
    http_status: result.status,
    content_type: metrics.content_type,
    content_length: metrics.content_length,
    bytes_downloaded: metrics.bytes_downloaded,
    total_ms: metrics.total_ms,
    download_ms: metrics.download_ms,
    host
  };
}



function formatDays(days) {
  if (!Number.isFinite(days)) return 'not set';
  if (days === 0) return '0 days (always refresh)';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) {
    const seconds = ms / 1000;
    return seconds >= 10 ? `${seconds.toFixed(0)} s` : `${seconds.toFixed(1)} s`;
  }
  const minutes = ms / 60000;
  return minutes >= 10 ? `${minutes.toFixed(0)} min` : `${minutes.toFixed(1)} min`;
}

function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatStatus(fmt, value) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 200 && numeric < 300) return fmt.COLORS.success(String(value));
    if (numeric >= 300 && numeric < 400) return fmt.COLORS.info(String(value));
    if (numeric >= 400 && numeric < 500) return fmt.COLORS.warning(String(value));
    if (numeric >= 500) return fmt.COLORS.error(String(value));
  }
  return String(value);
}

function formatOutcome(fmt, value) {
  if (!value) return '';
  const normalized = String(value);
  if (['valid-hub', 'fetched', 'probe-ok'].includes(normalized)) {
    return fmt.COLORS.success(normalized);
  }
  if (['cached-miss', 'retry-get', 'fallback-get', 'head-failed'].includes(normalized)) {
    return fmt.COLORS.warning(normalized);
  }
  if (normalized.includes('error') || normalized.includes('exception') || normalized.includes('rate')) {
    return fmt.COLORS.error(normalized);
  }
  return normalized;
}

function formatDeterminationStatus(fmt, value) {
  if (!value) return '';
  const normalized = String(value).toLowerCase();
  if (['processed', 'ready', 'complete', 'completed'].includes(normalized)) {
    return fmt.COLORS.success(value);
  }
  if (normalized === 'data-limited') {
    return fmt.COLORS.warning(value);
  }
  if (normalized === 'insufficient-data' || normalized === 'error') {
    return fmt.COLORS.error(value);
  }
  return value;
}

function renderSummary(summary, options, logBuffer = [], extras = {}) {
  const fmt = new CliFormatter();
  const domainDisplay = summary.domain || options.domain || '(unknown)';
  const schemeDisplay = (options.scheme || 'https').toUpperCase();
  const kindsDisplay = Array.isArray(options.kinds) && options.kinds.length
    ? options.kinds.join(', ')
    : 'country';
  const patternsPerPlace = Number.isFinite(options.patternsPerPlace)
    ? options.patternsPerPlace
    : 3;
  const limitLabel = Number.isFinite(options.limit) ? options.limit : null;
  const domainSummaries = Array.isArray(summary.domainSummaries) ? summary.domainSummaries : [];
  const multiDomain = domainSummaries.length > 1;
  const singleDomainEntry = domainSummaries.length === 1 ? domainSummaries[0] : null;
  const primarySummary = singleDomainEntry?.summary || summary;
  const readinessInfo = primarySummary?.readiness || null;
  const determinationStatus = singleDomainEntry?.determination || primarySummary?.determination || null;
  const determinationReason = singleDomainEntry?.determinationReason || primarySummary?.determinationReason || null;
  const latestDetermination = singleDomainEntry?.latestDetermination
    || primarySummary?.latestDetermination
    || summary.latestDetermination
    || null;
  const recommendationList = Array.isArray(primarySummary?.recommendations) && primarySummary.recommendations.length
    ? primarySummary.recommendations
    : (Array.isArray(summary.recommendations) ? summary.recommendations : []);

  fmt.header('Guess Place Hubs');

  fmt.section('Target Configuration');
  fmt.stat('Domain', domainDisplay);
  fmt.stat('Scheme', schemeDisplay);
  fmt.stat('Kinds requested', kindsDisplay);
  fmt.stat('Patterns per place', patternsPerPlace, 'number');
  if (limitLabel != null) {
    fmt.stat('Place limit', limitLabel, 'number');
  } else {
    fmt.stat('Place limit', 'unbounded');
  }
  fmt.stat('Mode', options.apply ? 'Apply (persist hubs)' : 'Dry run (no database writes)');
  if (options.hierarchical) {
    fmt.stat('Discovery mode', 'Hierarchical (place-place relationships)');
  } else {
    fmt.stat('Discovery mode', 'Standard (place hubs)');
  }
  fmt.stat('Max success cache window', formatDays(options.maxAgeDays));
  fmt.stat('Known 404 cache window', formatDays(options.refresh404Days));
  fmt.stat('Other 4xx retry window', formatDays(options.retry4xxDays));
  if (Number.isFinite(options.readinessTimeoutSeconds)) {
    if (options.readinessTimeoutSeconds === 0) {
      fmt.stat('Readiness probe timeout', 'disabled');
    } else {
      fmt.stat('Readiness probe timeout', `${options.readinessTimeoutSeconds}s`);
    }
  }

  if (domainSummaries.length <= 1 && (readinessInfo || determinationStatus || recommendationList.length || latestDetermination)) {
    fmt.section('Domain readiness');

    if (readinessInfo) {
      fmt.stat('Status', readinessInfo.status || 'unknown');
      if (readinessInfo.reason) {
        fmt.stat('Reason', readinessInfo.reason);
      }
      if (readinessInfo.metrics) {
        const metrics = readinessInfo.metrics;
        fmt.stat('Fetch records', metrics.fetchCount ?? 0, 'number');
        fmt.stat('Stored hubs', metrics.storedHubCount ?? 0, 'number');
        fmt.stat('Verified mappings', metrics.verifiedHubMappingCount ?? 0, 'number');
        fmt.stat('Known candidates', metrics.candidateCount ?? 0, 'number');
        if (Number.isFinite(metrics.elapsedMs)) {
          fmt.stat('Readiness probe duration', formatDurationMs(metrics.elapsedMs));
        }
        if (metrics.timedOut) {
          const completedCount = Array.isArray(metrics.completedMetrics) ? metrics.completedMetrics.length : 0;
          const skippedCount = Array.isArray(metrics.skippedMetrics) ? metrics.skippedMetrics.length : 0;
          fmt.stat('Readiness probes completed', `${completedCount} metric(s)`);
          fmt.stat('Readiness probes skipped', `${skippedCount} metric(s)`);
        }
      }
      if (readinessInfo.dspl) {
        const dsplSummary = readinessInfo.dspl;
        const dsplStatus = dsplSummary.available
          ? (dsplSummary.verifiedPatternCount > 0
            ? `verified patterns for ${dsplSummary.verifiedKinds.join(', ') || 'requested kinds'}`
            : 'available but no verified patterns for requested kinds')
          : 'not available';
        fmt.stat('DSPL coverage', dsplStatus);
        fmt.stat('Verified pattern count', dsplSummary.verifiedPatternCount, 'number');
      }
    }

    if (determinationStatus) {
      fmt.stat('Determination', determinationStatus);
      if (determinationReason) {
        fmt.stat('Determination reason', determinationReason);
      }
    }

    if (latestDetermination?.created_at) {
      fmt.stat('Recorded at', latestDetermination.created_at);
    }

    if (recommendationList.length) {
      fmt.list('Recommended next steps', recommendationList);
    }
  }

  fmt.section('Results');
  fmt.stat('Places evaluated', summary.totalPlaces, 'number');
  fmt.stat('URL candidates generated', summary.totalUrls, 'number');
  fmt.stat('Fetched (HTTP OK)', summary.fetched, 'number');
  fmt.stat('Cached successes reused', summary.cached, 'number');
  fmt.stat('Duplicates skipped', summary.skippedDuplicatePlace, 'number');
  fmt.stat('Recent 4xx skipped', summary.skippedRecent4xx, 'number');
  fmt.stat('Stored 404 responses', summary.stored404, 'number');
  fmt.stat('Inserted hubs', summary.insertedHubs, 'number');
  fmt.stat('Updated hubs', summary.updatedHubs, 'number');
  fmt.stat('Errors', summary.errors, 'number');
  fmt.stat('Rate limit responses', summary.rateLimited, 'number');
  if (Number.isFinite(summary.durationMs)) {
    fmt.stat('Run duration', formatDurationMs(summary.durationMs));
  }
  fmt.stat('Validation passed', summary.validationSucceeded, 'number');
  fmt.stat('Validation failed', summary.validationFailed, 'number');
  if (Number.isFinite(summary.readinessTimedOut) && summary.readinessTimedOut > 0) {
    fmt.stat('Domains with readiness timeout', summary.readinessTimedOut, 'number');
  }

  // Add audit trail statistics if available
  if (summary.auditCounts) {
    fmt.stat('Audit trail entries', summary.auditCounts.total, 'number');
    fmt.stat('Accepted hubs', summary.auditCounts.accepted, 'number');
    fmt.stat('Rejected hubs', summary.auditCounts.rejected, 'number');
  }

  if (summary.insertedHubs > 0 || summary.updatedHubs > 0) {
    fmt.success(`Persisted ${summary.insertedHubs} new hub(s) and ${summary.updatedHubs} update(s).`);
  } else if (!options.apply) {
    fmt.info('Dry run: pass --apply to write confirmed hubs to place_hubs.');
  }

  if (summary.errors > 0) {
    fmt.error(`${summary.errors} request(s) failed. Inspect recent decisions for details.`);
  }

  if (summary.rateLimited > 0) {
    fmt.warn(`${summary.rateLimited} rate limit response(s) encountered — processing halted early.`);
  }

  if (summary.validationFailed > 0 && summary.validationFailureReasons) {
    const failureReasons = Object.entries(summary.validationFailureReasons)
      .filter(([reason, count]) => reason && Number(count) > 0)
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 5)
      .map(([reason, count]) => `${reason} (${count})`);
    if (failureReasons.length) {
      fmt.list('Top validation failure reasons', failureReasons);
    }
  }

  const diffPreview = primarySummary?.diffPreview || summary.diffPreview || { inserted: [], updated: [] };
  const insertedDiff = Array.isArray(diffPreview?.inserted) ? diffPreview.inserted : [];
  const updatedDiff = Array.isArray(diffPreview?.updated) ? diffPreview.updated : [];

  if (insertedDiff.length || updatedDiff.length) {
    const formatPlaceLabel = (entry) => {
      const name = entry?.placeName || '(unknown)';
      const kind = entry?.placeKind ? String(entry.placeKind).toLowerCase() : '';
      if (kind && kind !== 'unknown') {
        return `${name} (${kind})`;
      }
      return name;
    };

    const summarizeChanges = (changes) => {
      if (!Array.isArray(changes) || !changes.length) {
        return '';
      }
      return changes
        .map((change) => {
          const beforeValue = change?.before ?? '—';
          const afterValue = change?.after ?? '—';
          return `${change?.field || 'Field'}: ${beforeValue} → ${afterValue}`;
        })
        .slice(0, 4)
        .join('; ');
    };

    const insertedRows = insertedDiff.map((item) => ({
      ...(multiDomain ? { domain: item?.domain || domainDisplay } : {}),
      place: formatPlaceLabel(item),
      url: truncate(item?.url || '', multiDomain ? 70 : 80),
      title: truncate(item?.title || '', 60),
      strategy: item?.strategy || ''
    }));

    const updatedRows = updatedDiff.map((item) => ({
      ...(multiDomain ? { domain: item?.domain || domainDisplay } : {}),
      place: formatPlaceLabel(item),
      url: truncate(item?.url || '', multiDomain ? 60 : 70),
      changes: truncate(summarizeChanges(item?.changes), 100)
    }));

    const diffSectionLabel = options.apply ? 'Persisted hub changes' : 'Proposed hub changes';
    fmt.section(diffSectionLabel);

    if (insertedRows.length) {
      const columns = multiDomain
        ? ['domain', 'place', 'url', 'title', 'strategy']
        : ['place', 'url', 'title', 'strategy'];
      fmt.table(insertedRows, { columns });
    }

    if (updatedRows.length) {
      const columns = multiDomain
        ? ['domain', 'place', 'url', 'changes']
        : ['place', 'url', 'changes'];
      fmt.table(updatedRows, { columns });
    }

  } else {
    fmt.info('No hub changes detected.');
  }

  if (domainSummaries.length > 1) {
    fmt.section('Per-domain overview');
    fmt.table(
      domainSummaries.map((entry) => {
        const domainSummary = entry.summary || {};
        const statusValue = entry.determination || entry.readiness?.status || (entry.error ? 'error' : 'processed');
        let note = entry.determinationReason
          || entry.readiness?.reason
          || entry.error?.message
          || '';
        if (!note && entry.readinessProbe?.timedOut) {
          note = 'Readiness probes timed out';
        }
        return {
          domain: entry.domain,
          status: statusValue,
          urls: domainSummary.totalUrls ?? 0,
          inserted: options.apply
            ? domainSummary.insertedHubs ?? 0
            : (entry.diffPreview?.inserted?.length ?? domainSummary.diffPreview?.inserted?.length ?? 0),
          updated: options.apply
            ? domainSummary.updatedHubs ?? 0
            : (entry.diffPreview?.updated?.length ?? domainSummary.diffPreview?.updated?.length ?? 0),
          notes: truncate(note, 80)
        };
      }),
      {
        columns: ['domain', 'status', 'urls', 'inserted', 'updated', 'notes'],
        format: {
          status: (value) => formatDeterminationStatus(fmt, value)
        }
      }
    );
  }

  if (Array.isArray(summary.unsupportedKinds) && summary.unsupportedKinds.length) {
    fmt.list('Unsupported place kinds ignored', summary.unsupportedKinds);
  }

  const decisions = Array.isArray(summary.decisions) ? summary.decisions : [];
  const recentDecisions = decisions.slice(-12);
  fmt.section('Recent decisions');
  if (recentDecisions.length) {
    fmt.table(
      recentDecisions.map((decision) => ({
        stage: decision.stage || '',
        status: decision.status == null ? '' : String(decision.status),
        outcome: decision.outcome || '',
        message: truncate(decision.message || '', 100)
      })),
      {
        columns: ['stage', 'status', 'outcome', 'message'],
        format: {
          status: (value) => formatStatus(fmt, value),
          outcome: (value) => formatOutcome(fmt, value)
        }
      }
    );
    const remaining = decisions.length - recentDecisions.length;
    if (remaining > 0) {
      fmt.info(`${remaining} additional decision entry(ies) truncated. Use --json for the full log.`);
    }
  } else {
    fmt.info('No new HTTP requests were required; cached data satisfied all predictions.');
  }

  if (options.verbose && logBuffer.length) {
    fmt.section('Verbose log');
    for (const entry of logBuffer) {
      const cleaned = entry.message.replace(/^\[guess-place-hubs\]\s*/, '');
      if (entry.level === 'warn') {
        fmt.warn(cleaned);
      } else if (entry.level === 'error') {
        fmt.error(cleaned);
      } else {
        fmt.info(cleaned);
      }
    }
  }

  if (options.emitReport && extras?.reportStatus) {
    const status = extras.reportStatus;
    if (status.error) {
      fmt.error(`Report not saved: ${status.error}`);
    } else if (status.path) {
      fmt.success(`Report written to ${status.path}`);
    }
  }

  fmt.footer();
}

async function main(argv) {
  const options = ArgumentNormalizer.parseCliArgs(argv);

  const domainBatch = Array.isArray(options.domainBatch) ? options.domainBatch : [];
  if (domainBatch.length === 0) {
    console.error('At least one domain or host is required. Provide positional arguments, --domain, --domains, or --import.');
    process.exitCode = 1;
    return;
  }

  const logBuffer = [];
  
  // Create dependencies using orchestration layer factory
  const dbPath = resolveDbPath(options.dbPath);
  const deps = createPlaceHubDependencies({
    dbPath,
    verbose: options.verbose
  });
  
  // Capture log entries from orchestration layer
  const originalLogger = deps.logger;
  deps.logger = {
    info(message) {
      if (options.verbose) {
        logBuffer.push({ level: 'info', message });
      }
      originalLogger.info(message);
    },
    warn(message) {
      if (options.verbose) {
        logBuffer.push({ level: 'warn', message });
      }
      originalLogger.warn(message);
    },
    error(message) {
      logBuffer.push({ level: 'error', message });
      originalLogger.error(message);
    }
  };

  // Call orchestration layer (pure business logic, no CLI concerns)
  const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const batchOptions = { ...options, runId };
  const { aggregate: batchSummary } = await guessPlaceHubsBatch(batchOptions, deps);

  // Add runId to summary for JSON output
  batchSummary.runId = runId;

  // Load audit trail for this run to include in summary
  let auditCounts = { total: 0, accepted: 0, rejected: 0 };
  try {
    const auditTrail = deps.queries.loadAuditTrail(runId);
    auditCounts.total = auditTrail.length;
    auditCounts.accepted = auditTrail.filter(entry => entry.decision === 'accepted').length;
    auditCounts.rejected = auditTrail.filter(entry => entry.decision === 'rejected').length;
    batchSummary.auditCounts = auditCounts;
  } catch (error) {
    // Audit loading is optional - don't fail the run if it fails
    deps.logger.warn(`[guess-place-hubs] Failed to load audit trail: ${error.message || error}`);
  }
  
  const renderOptions = {
    ...options,
    domain: batchSummary.domain
  };

  const jsonSummary = buildJsonSummary(batchSummary, options, logBuffer);
  let reportStatus = null;

  if (options.emitReport) {
    const reportResult = writeReportFile(jsonSummary, options);
    if (reportResult?.payload) {
      Object.assign(jsonSummary, reportResult.payload);
      reportStatus = {
        path: reportResult.path,
        directory: reportResult.directory,
        savedAt: reportResult.savedAt
      };
    } else if (reportResult?.error) {
      jsonSummary.report = {
        ...(jsonSummary.report || {}),
        requested: true,
        targetPath: options.reportPath || null,
        directory: options.reportDirectory || null,
        written: false,
        error: reportResult.error
      };
      reportStatus = { error: reportResult.error };
    }
  }

  if (options.json) {
    for (const entry of logBuffer) {
      if (entry.level === 'error' || (options.verbose && (entry.level === 'warn' || entry.level === 'info'))) {
        console.error(entry.message);
      }
    }
    if (reportStatus?.error) {
      console.error(`Failed to write report: ${reportStatus.error}`);
    } else if (reportStatus?.path) {
      console.error(`Report written to ${reportStatus.path}`);
    }
    console.log(JSON.stringify(jsonSummary, null, 2));
    return;
  }

  renderSummary(batchSummary, renderOptions, logBuffer, { reportStatus });
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  guessPlaceHubs,
  parseCliArgs: ArgumentNormalizer.parseCliArgs,
  resolveDbPath,
  normalizeDomain,
  extractTitle,
  buildDomainBatchInputs: BatchLoader.buildDomainBatchInputs,
  parseDomainImportFile: BatchLoader.parseDomainImportFile,
  buildJsonSummary: ReportWriter.buildJsonSummary,
  writeReportFile,
  renderSummary
};
