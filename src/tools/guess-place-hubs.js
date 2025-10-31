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
const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { guessPlaceHubsBatch } = require('../orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../orchestration/dependencies');

const DAY_MS = 24 * 60 * 60 * 1000;


function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function collectFlagValues(argv, flag) {
  if (!Array.isArray(argv) || argv.length === 0 || !flag) {
    return [];
  }

  const results = [];
  const flagWithEquals = `${flag}=`;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (typeof next === 'string' && !next.startsWith('-')) {
        results.push(next);
        index += 1;
      }
      continue;
    }

    if (token.startsWith(flagWithEquals)) {
      const value = token.slice(flagWithEquals.length);
      if (value) {
        results.push(value);
      }
    }
  }

  return results;
}

function splitCsvLine(line) {
  if (typeof line !== 'string' || line.length === 0) {
    return [];
  }

  const segments = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  segments.push(current.trim());
  return segments.map((segment) => segment.trim());
}

function parseDomainImportFile(importPath) {
  if (!importPath) {
    return [];
  }

  const resolvedPath = path.isAbsolute(importPath)
    ? importPath
    : path.join(process.cwd(), importPath);

  let contents;
  try {
    contents = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    throw Object.assign(new Error(`Failed to read domain import file at ${resolvedPath}: ${error.message || error}`), {
      cause: error
    });
  }

  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (!lines.length) {
    return [];
  }

  const headerFields = splitCsvLine(lines[0]).map((field) => field.toLowerCase());
  const hasHeader = headerFields.includes('domain');
  const headers = hasHeader ? headerFields : null;
  const startIndex = hasHeader ? 1 : 0;

  const resolveField = (fields, name, fallbackIndex) => {
    if (headers) {
      const headerIndex = headers.indexOf(name);
      if (headerIndex !== -1 && fields[headerIndex] != null) {
        return fields[headerIndex].trim();
      }
    }
    if (typeof fallbackIndex === 'number' && fallbackIndex < fields.length) {
      return fields[fallbackIndex].trim();
    }
    return '';
  };

  const entries = [];

  for (let idx = startIndex; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (!fields.length) continue;

    const domainValue = resolveField(fields, 'domain', 0);
    if (!domainValue) continue;

    const kindsValue = resolveField(fields, 'kinds', 1);
    const limitValue = resolveField(fields, 'limit', 2);

    let kinds = parseCsv(kindsValue);
    if (!kinds.length) {
      kinds = null;
    }

    const parsedLimit = Number.parseInt(limitValue, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;

    entries.push({
      domain: domainValue,
      kinds,
      limit,
      raw: line,
      rowNumber: idx + 1,
      source: resolvedPath
    });
  }

  return entries;
}

function buildDomainBatchInputs({
  repeatedDomains = [],
  positionalDomains = [],
  csvDomains = [],
  importedDomains = [],
  envDomain = null,
  defaultKinds = [],
  defaultLimit = null,
  scheme = 'https'
}) {
  const entryMap = new Map();
  const order = [];

  const upsert = (rawValue, origin, overrides = {}) => {
    if (!rawValue) return;
    const trimmed = String(rawValue).trim();
    if (!trimmed) return;

    const normalized = normalizeDomain(trimmed, scheme);
    const host = normalized?.host || trimmed.toLowerCase();
    if (!host) return;

    const sourceTag = origin || 'unknown';
    const kindsOverride = Array.isArray(overrides.kinds) && overrides.kinds.length ? overrides.kinds : null;
    const limitOverride = Number.isFinite(overrides.limit) ? overrides.limit : null;

    if (entryMap.has(host)) {
      const existing = entryMap.get(host);
      existing.sources.add(sourceTag);
      if (!existing.raw) existing.raw = trimmed;
      if (normalized?.scheme && !existing.schemeFromInput) {
        existing.schemeFromInput = normalized.scheme;
      }
      if (kindsOverride) {
        existing.kinds = kindsOverride;
      }
      if (limitOverride != null) {
        existing.limit = limitOverride;
      }
      return;
    }

    entryMap.set(host, {
      raw: trimmed,
      domain: host,
      schemeFromInput: normalized?.scheme || null,
      sources: new Set([sourceTag]),
      kinds: kindsOverride,
      limit: limitOverride
    });
    order.push(host);
  };

  for (const value of repeatedDomains) {
    upsert(value, '--domain');
  }

  for (const value of positionalDomains) {
    upsert(value, 'positional');
  }

  for (const value of csvDomains) {
    upsert(value, '--domains');
  }

  for (const item of importedDomains) {
    if (!item) continue;
    upsert(item.domain, '--import', { kinds: item.kinds || null, limit: item.limit ?? null });
  }

  if (!entryMap.size && envDomain) {
    upsert(envDomain, 'env');
  }

  return order.map((host) => {
    const entry = entryMap.get(host);
    const resolvedKinds = entry.kinds && entry.kinds.length ? entry.kinds : defaultKinds;
    const effectiveKinds = Array.isArray(resolvedKinds) ? [...resolvedKinds] : [];
    const effectiveLimit = entry.limit != null ? entry.limit : defaultLimit;
    const selectedScheme = entry.schemeFromInput || scheme;

    return {
      raw: entry.raw,
      domain: host,
      scheme: selectedScheme,
      base: `${selectedScheme}://${host}`,
      kinds: effectiveKinds,
      kindsOverride: entry.kinds || null,
      limit: effectiveLimit,
      limitOverride: entry.limit,
      sources: Array.from(entry.sources)
    };
  });
}

const DSPL_KIND_PROPERTY_MAP = Object.freeze({
  country: 'countryHubPatterns',
  region: 'regionHubPatterns',
  city: 'cityHubPatterns'
});

function resolveReportOutput({ requested = false, explicitPath = null, reportDir = null }) {
  if (!requested) {
    return {
      requested: false,
      path: null,
      directory: null
    };
  }

  const projectRoot = findProjectRoot(__dirname);
  const cwd = process.cwd();
  const normalizedReportDir = reportDir && typeof reportDir === 'string' && reportDir.trim().length
    ? (path.isAbsolute(reportDir) ? reportDir.trim() : path.resolve(cwd, reportDir.trim()))
    : path.join(projectRoot, 'place-hub-reports');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFile = `guess-place-hubs-${timestamp}.json`;

  let targetDir = normalizedReportDir;
  let targetPath = null;

  const resolveCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'string') {
      return null;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
  };

  const explicitResolved = resolveCandidate(explicitPath);

  if (explicitResolved) {
    let stats = null;
    try {
      stats = fs.statSync(explicitResolved);
    } catch (_) {
      stats = null;
    }

    if (stats?.isDirectory?.()) {
      targetDir = explicitResolved;
    } else if (stats?.isFile?.()) {
      targetDir = path.dirname(explicitResolved);
      targetPath = explicitResolved;
    } else {
      const endsWithSep = /[\\/]+$/.test(explicitResolved);
      if (endsWithSep) {
        targetDir = explicitResolved.replace(/[\\/]+$/, '') || normalizedReportDir;
      } else {
        const ext = path.extname(explicitResolved);
        if (ext) {
          targetDir = path.dirname(explicitResolved);
          targetPath = explicitResolved;
        } else {
          targetDir = explicitResolved;
        }
      }
    }
  }

  if (!targetDir) {
    targetDir = normalizedReportDir;
  }

  if (!targetPath) {
    targetPath = path.join(targetDir, defaultFile);
  }

  return {
    requested: true,
    path: targetPath,
    directory: targetDir
  };
}

function collectHubChanges(existingHub, nextSnapshot) {
  if (!existingHub || !nextSnapshot) {
    return [];
  }

  const descriptors = [
    { label: 'Place slug', nextKey: 'placeSlug', existingKey: 'place_slug' },
    { label: 'Place kind', nextKey: 'placeKind', existingKey: 'place_kind' },
    { label: 'Title', nextKey: 'title', existingKey: 'title' },
    { label: 'Nav links', nextKey: 'navLinksCount', existingKey: 'nav_links_count' },
    { label: 'Article links', nextKey: 'articleLinksCount', existingKey: 'article_links_count' }
  ];

  const changes = [];
  for (const descriptor of descriptors) {
    const after = nextSnapshot[descriptor.nextKey];
    if (after === undefined || after === null) {
      continue;
    }
    const before = existingHub[descriptor.existingKey];
    const normalizedBefore = before === undefined ? null : before;
    const normalizedAfter = after;
    if (normalizedBefore === normalizedAfter) {
      continue;
    }
    if (typeof normalizedBefore === 'number' && typeof normalizedAfter === 'number' && Number.isFinite(normalizedBefore) && Number.isFinite(normalizedAfter)) {
      if (normalizedBefore === normalizedAfter) {
        continue;
      }
    }
    changes.push({
      field: descriptor.label,
      before: normalizedBefore === undefined ? null : normalizedBefore,
      after: normalizedAfter
    });
  }

  return changes;
}

function summarizeDsplPatterns(dsplEntry, kinds) {
  const normalizedKinds = (Array.isArray(kinds) && kinds.length ? kinds : ['country'])
    .map((kind) => String(kind).toLowerCase());

  const summary = {
    available: Boolean(dsplEntry),
    requestedKinds: normalizedKinds,
    verifiedKinds: [],
    totalPatterns: 0,
    verifiedPatternCount: 0,
    byKind: {}
  };

  if (!dsplEntry) {
    return summary;
  }

  for (const kind of normalizedKinds) {
    const property = DSPL_KIND_PROPERTY_MAP[kind] || `${kind}HubPatterns`;
    const patterns = Array.isArray(dsplEntry[property]) ? dsplEntry[property] : [];
    const verifiedPatterns = patterns.filter((pattern) => pattern && pattern.verified !== false);

    summary.byKind[kind] = {
      total: patterns.length,
      verified: verifiedPatterns.length
    };

    summary.totalPatterns += patterns.length;
    summary.verifiedPatternCount += verifiedPatterns.length;

    if (verifiedPatterns.length) {
      summary.verifiedKinds.push(kind);
    }
  }

  return summary;
}


function parseCliArgs(argv) {
  const rawArgv = Array.isArray(argv) ? [...argv] : process.argv.slice(2);
  const parser = new CliArgumentParser('guess-place-hubs', 'Predict candidate place hubs and verify them');

  parser.add('--domain <domain>', 'Domain or host to inspect (repeatable; positional args supported)', [], (value, previous) => {
    const acc = Array.isArray(previous) ? previous.slice() : [];
    acc.push(value);
    return acc;
  });
  parser.add('--domains <csv>', 'Comma-separated list of domains to inspect (batch mode)', null);
  parser.add('--import <file>', 'CSV file of domains (columns: domain,kinds,limit)', null);
  parser.add('--db <path>', 'Path to SQLite database (defaults to data/news.db)', null);
  parser.add('--db-path <path>', 'Alias for --db', null);
  parser.add('--kinds <csv>', 'Place kinds to consider (country, region, city)', 'country');
  parser.add('--limit <n>', 'Limit number of places to evaluate', null, 'number');
  parser.add('--patterns-per-place <n>', 'Maximum URL patterns to test per place (default 3)', 3, 'number');
  parser.add('--max-age-days <n>', 'Skip re-fetch when success newer than N days (default 7)', 7, 'number');
  parser.add('--refresh-404-days <n>', 'Skip re-fetching known 404s newer than N days (default 180)', 180, 'number');
  parser.add('--retry-4xx-days <n>', 'Skip retrying other 4xx statuses newer than N days (default 7)', 7, 'number');
  parser.add('--apply', 'Persist confirmed hubs to place_hubs table', false, 'boolean');
  parser.add('--dry-run', 'Do not persist hubs (default behaviour)', false, 'boolean');
  parser.add('--verbose', 'Enable verbose logging', false, 'boolean');
  parser.add('--http', 'Use http scheme instead of https', false, 'boolean');
  parser.add('--scheme <scheme>', 'Override URL scheme (http or https)', 'https');
  parser.add('--readiness-timeout <seconds>', 'Maximum seconds allotted to readiness probes (0 = unlimited, default 10)', 10, 'number');
  parser.add('--json', 'Emit JSON summary output', false, 'boolean');
  parser.add('--emit-report [path]', 'Write detailed JSON report to disk (optional path or directory)', null);
  parser.add('--report-dir <path>', 'Directory used when --emit-report omits a filename', null);
  parser.add('--hierarchical', 'Enable hierarchical place-place hub discovery (parent/child relationships)', false, 'boolean');

  const parsedArgs = parser.parse(rawArgv);

  const schemeInput = parsedArgs.http ? 'http' : (parsedArgs.scheme ? String(parsedArgs.scheme).toLowerCase() : 'https');
  const scheme = ['http', 'https'].includes(schemeInput) ? schemeInput : 'https';

  const kindsInput = parsedArgs.kinds != null ? parsedArgs.kinds : 'country';
  const kinds = parseCsv(kindsInput);
  if (!kinds.length) kinds.push('country');
  const uniqueKinds = Array.from(new Set(kinds.map((kind) => kind.toLowerCase())));

  const limit = Number.isFinite(parsedArgs.limit) ? parsedArgs.limit : null;
  const patternsPerPlace = Number.isFinite(parsedArgs.patternsPerPlace)
    ? Math.max(1, parsedArgs.patternsPerPlace)
    : 3;
  const maxAgeDays = Number.isFinite(parsedArgs.maxAgeDays)
    ? Math.max(0, parsedArgs.maxAgeDays)
    : 7;
  const refresh404Days = Number.isFinite(parsedArgs.refresh404Days)
    ? Math.max(0, parsedArgs.refresh404Days)
    : 180;
  const retry4xxDays = Number.isFinite(parsedArgs.retry4xxDays)
    ? Math.max(0, parsedArgs.retry4xxDays)
    : 7;
  const readinessTimeoutSeconds = Number.isFinite(parsedArgs.readinessTimeout)
    ? Math.max(0, parsedArgs.readinessTimeout)
    : 10;
  const readinessTimeoutMs = readinessTimeoutSeconds > 0 ? readinessTimeoutSeconds * 1000 : null;

  let apply = parsedArgs.apply === true;
  if (parsedArgs.dryRun === true) {
    apply = false;
  }

  const emitReportRaw = parsedArgs.emitReport;
  const reportDirRaw = parsedArgs.reportDir;
  const reportResolution = resolveReportOutput({
    requested: emitReportRaw !== undefined && emitReportRaw !== null,
    explicitPath: typeof emitReportRaw === 'string' ? emitReportRaw : null,
    reportDir: reportDirRaw || null
  });

  const dbPath = parsedArgs.dbPath || parsedArgs.db || null;

  const positionalDomains = Array.isArray(parsedArgs.positional) ? parsedArgs.positional : [];
  const domainFlags = Array.isArray(parsedArgs.domain) ? parsedArgs.domain : (parsedArgs.domain ? [parsedArgs.domain] : []);

  const csvDomainArgs = collectFlagValues(rawArgv, '--domains');
  if (parsedArgs.domains && !csvDomainArgs.includes(parsedArgs.domains)) {
    csvDomainArgs.push(parsedArgs.domains);
  }
  const csvDomainList = csvDomainArgs.flatMap((value) => parseCsv(value));

  const importFlagValues = collectFlagValues(rawArgv, '--import');
  if (parsedArgs.import && !importFlagValues.includes(parsedArgs.import)) {
    importFlagValues.push(parsedArgs.import);
  }
  const importedDomains = [];
  for (const importCandidate of importFlagValues) {
    if (!importCandidate) continue;
    const entries = parseDomainImportFile(importCandidate);
    if (entries.length) {
      importedDomains.push(...entries);
    }
  }

  const envDomain = process.env.GPH_DOMAIN || null;

  const domainBatch = buildDomainBatchInputs({
    repeatedDomains: domainFlags,
    positionalDomains,
    csvDomains: csvDomainList,
    importedDomains,
    envDomain,
    defaultKinds: uniqueKinds,
    defaultLimit: limit,
    scheme
  });

  const primaryDomain = domainBatch.length ? domainBatch[0].domain : null;

  return {
    domain: primaryDomain,
    domains: domainBatch,
    domainBatch,
    domainInputs: {
      repeated: domainFlags,
      positional: positionalDomains,
      csv: csvDomainList,
      imported: importedDomains,
      env: envDomain ? [envDomain] : []
    },
    importPaths: importFlagValues,
    dbPath,
    kinds: uniqueKinds,
    limit,
    patternsPerPlace,
    apply,
    maxAgeDays,
    refresh404Days,
    retry4xxDays,
    verbose: Boolean(parsedArgs.verbose),
    scheme,
    readinessTimeoutSeconds,
    readinessTimeoutMs,
    json: Boolean(parsedArgs.json),
    dryRun: !apply,
    emitReport: reportResolution.requested,
    reportPath: reportResolution.path,
    reportDirectory: reportResolution.directory,
    hierarchical: Boolean(parsedArgs.hierarchical)
  };
}

const SUMMARY_NUMERIC_FIELDS = [
  'totalPlaces',
  'totalUrls',
  'fetched',
  'cached',
  'skipped',
  'skippedDuplicatePlace',
  'skippedRecent4xx',
  'stored404',
  'insertedHubs',
  'updatedHubs',
  'errors',
  'rateLimited',
  'readinessTimedOut',
  'validationSucceeded',
  'validationFailed'
];

const MAX_DECISION_HISTORY = 200;


function aggregateSummaryInto(target, source, entry) {
  if (!target || !source) return;

  for (const field of SUMMARY_NUMERIC_FIELDS) {
    const value = Number(source[field]) || 0;
    target[field] = (target[field] || 0) + value;
  }

  if (Array.isArray(source.unsupportedKinds) && source.unsupportedKinds.length) {
    const merged = new Set(target.unsupportedKinds);
    for (const kind of source.unsupportedKinds) {
      if (kind) merged.add(kind);
    }
    target.unsupportedKinds = Array.from(merged);
  }

  if (Array.isArray(source.decisions) && source.decisions.length) {
    for (const decision of source.decisions) {
      if (decision && typeof decision === 'object') {
        target.decisions.push({
          ...decision,
          domain: decision.domain || source.domain || entry?.domain || null
        });
      } else {
        target.decisions.push(decision);
      }
    }
  }

  if (source.diffPreview && typeof source.diffPreview === 'object') {
    if (!target.diffPreview || typeof target.diffPreview !== 'object') {
      target.diffPreview = {
        inserted: [],
        updated: []
      };
    }

    if (Array.isArray(source.diffPreview.inserted)) {
      for (const inserted of source.diffPreview.inserted) {
        if (!inserted || typeof inserted !== 'object') continue;
        target.diffPreview.inserted.push({
          ...inserted,
          domain: inserted.domain || entry?.domain || source.domain || null
        });
      }
    }

    if (Array.isArray(source.diffPreview.updated)) {
      for (const updated of source.diffPreview.updated) {
        if (!updated || typeof updated !== 'object') continue;
        const cloned = {
          ...updated,
          domain: updated.domain || entry?.domain || source.domain || null
        };
        if (Array.isArray(updated.changes)) {
          cloned.changes = updated.changes.map((change) => ({ ...change }));
        }
        target.diffPreview.updated.push(cloned);
      }
    }
  }

  if (source.validationFailureReasons && typeof source.validationFailureReasons === 'object') {
    if (!target.validationFailureReasons || typeof target.validationFailureReasons !== 'object') {
      target.validationFailureReasons = {};
    }
    for (const [reason, count] of Object.entries(source.validationFailureReasons)) {
      if (reason) {
        const numericCount = Number(count) || 0;
        target.validationFailureReasons[reason] = (target.validationFailureReasons[reason] || 0) + numericCount;
      }
    }
  }
}

function snapshotDiffPreview(diffPreview) {
  const inserted = Array.isArray(diffPreview?.inserted)
    ? diffPreview.inserted.map((item) => (item && typeof item === 'object' ? { ...item } : item))
    : [];
  const updated = Array.isArray(diffPreview?.updated)
    ? diffPreview.updated.map((item) => {
        if (!item || typeof item !== 'object') {
          return item;
        }
        const cloned = { ...item };
        if (Array.isArray(item.changes)) {
          cloned.changes = item.changes.map((change) => (change && typeof change === 'object' ? { ...change } : change));
        }
        return cloned;
      })
    : [];

  return {
    insertedCount: inserted.length,
    updatedCount: updated.length,
    totalChanges: inserted.length + updated.length,
    inserted,
    updated
  };
}

function buildJsonSummary(summary, options = {}, logEntries = []) {
  const totals = SUMMARY_NUMERIC_FIELDS.reduce((acc, field) => {
    acc[field] = summary && summary[field] != null ? summary[field] : 0;
    return acc;
  }, {});

  const diffSnapshot = snapshotDiffPreview(summary?.diffPreview || {});

  const cloneFailureReasons = (source) => {
    if (!source || typeof source !== 'object') {
      return {};
    }
    const cloned = {};
    for (const [reason, count] of Object.entries(source)) {
      if (!reason) continue;
      const numeric = Number(count);
      cloned[reason] = Number.isFinite(numeric) ? numeric : 0;
    }
    return cloned;
  };

  const deriveCandidateMetrics = (numericMetrics = {}, summarySource = {}) => ({
    generated: numericMetrics.totalUrls ?? 0,
    cachedHits: numericMetrics.cached ?? 0,
    cachedKnown404: summarySource.skipped ?? numericMetrics.skipped ?? 0,
    cachedRecent4xx: numericMetrics.skippedRecent4xx ?? 0,
    duplicates: numericMetrics.skippedDuplicatePlace ?? 0,
    stored404: numericMetrics.stored404 ?? 0,
    fetchedOk: numericMetrics.fetched ?? 0,
    validationPassed: summarySource.validationSucceeded ?? numericMetrics.validationSucceeded ?? 0,
    validationFailed: summarySource.validationFailed ?? numericMetrics.validationFailed ?? 0,
    rateLimited: numericMetrics.rateLimited ?? 0,
    persistedInserts: numericMetrics.insertedHubs ?? 0,
    persistedUpdates: numericMetrics.updatedHubs ?? 0,
    errors: numericMetrics.errors ?? 0
  });

  const domainSummaries = Array.isArray(summary?.domainSummaries)
    ? summary.domainSummaries.map((entry) => {
        const domainSummary = entry?.summary || {};
        const domainDiff = snapshotDiffPreview(entry?.diffPreview || domainSummary?.diffPreview || {});
        const metrics = SUMMARY_NUMERIC_FIELDS.reduce((acc, field) => {
          acc[field] = domainSummary[field] != null ? domainSummary[field] : 0;
          return acc;
        }, {});
        const statusValue = entry?.determination
          || entry?.readiness?.status
          || (entry?.error ? 'error' : 'processed');
        const validationSummary = {
          passed: domainSummary.validationSucceeded ?? metrics.validationSucceeded ?? 0,
          failed: domainSummary.validationFailed ?? metrics.validationFailed ?? 0,
          failureReasons: cloneFailureReasons(domainSummary.validationFailureReasons)
        };
        const candidateMetrics = deriveCandidateMetrics(metrics, domainSummary);
        const timing = {
          startedAt: domainSummary.startedAt || null,
          completedAt: domainSummary.completedAt || null,
          durationMs: Number.isFinite(domainSummary.durationMs) ? domainSummary.durationMs : null
        };

        return {
          index: entry?.index ?? null,
          domain: entry?.domain ?? null,
          scheme: entry?.scheme ?? null,
          base: entry?.base ?? null,
          kinds: Array.isArray(entry?.kinds) ? [...entry.kinds] : [],
          limit: entry?.limit ?? null,
          sources: Array.isArray(entry?.sources) ? [...entry.sources] : [],
          status: statusValue,
          determination: entry?.determination || null,
          determinationReason: entry?.determinationReason || null,
          readiness: entry?.readiness || null,
          readinessProbe: entry?.readinessProbe || null,
          latestDetermination: entry?.latestDetermination || null,
          recommendations: Array.isArray(entry?.recommendations) ? [...entry.recommendations] : [],
          diffPreview: domainDiff,
          metrics,
          candidateMetrics,
          validationSummary,
          timing,
          error: entry?.error || null
        };
      })
    : [];

  const logs = Array.isArray(logEntries)
    ? logEntries.map((entry) => ({ level: entry.level || 'info', message: entry.message || '' }))
    : [];

  const reportDirectory = options?.reportDirectory
    || (options?.reportPath ? path.dirname(options.reportPath) : null);

  const validationSummary = {
    passed: summary?.validationSucceeded ?? totals.validationSucceeded ?? 0,
    failed: summary?.validationFailed ?? totals.validationFailed ?? 0,
    failureReasons: cloneFailureReasons(summary?.validationFailureReasons)
  };

  const candidateMetrics = deriveCandidateMetrics(totals, summary || {});

  const auditCounts = summary?.auditCounts || null;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    domain: summary?.domain ?? null,
    run: {
      startedAt: summary?.startedAt || null,
      completedAt: summary?.completedAt || null,
      durationMs: Number.isFinite(summary?.durationMs) ? summary.durationMs : null,
      runId: summary?.runId || null
    },
    batch: {
      totalDomains: summary?.batch?.totalDomains ?? null,
      processedDomains: summary?.batch?.processedDomains ?? null,
      truncatedDecisionCount: summary?.batch?.truncatedDecisionCount ?? 0
    },
    totals,
    diffPreview: diffSnapshot,
    candidateMetrics,
    validationSummary,
    auditCounts,
    unsupportedKinds: Array.isArray(summary?.unsupportedKinds) ? [...summary.unsupportedKinds] : [],
    options: {
      scheme: options?.scheme || 'https',
      kinds: Array.isArray(options?.kinds) ? [...options.kinds] : [],
      limit: options?.limit ?? null,
      patternsPerPlace: options?.patternsPerPlace ?? null,
      apply: Boolean(options?.apply),
      dryRun: Boolean(options?.dryRun),
      maxAgeDays: options?.maxAgeDays ?? null,
      refresh404Days: options?.refresh404Days ?? null,
      retry4xxDays: options?.retry4xxDays ?? null,
      readinessTimeoutSeconds: options?.readinessTimeoutSeconds ?? null,
      domainBatchSize: Array.isArray(options?.domainBatch) ? options.domainBatch.length : null,
      emitReport: Boolean(options?.emitReport),
      reportPath: options?.reportPath || null,
      reportDirectory
    },
    domainInputs: options?.domainInputs || null,
    domainSummaries,
    decisions: Array.isArray(summary?.decisions)
      ? summary.decisions.map((decision) => (decision && typeof decision === 'object' ? { ...decision } : decision))
      : [],
    logs,
    report: {
      requested: Boolean(options?.emitReport),
      targetPath: options?.reportPath || null,
      directory: reportDirectory,
      written: false
    }
  };
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
  const options = parseCliArgs(argv);

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
  parseCliArgs,
  resolveDbPath,
  normalizeDomain,
  extractTitle,
  buildDomainBatchInputs,
  parseDomainImportFile,
  buildJsonSummary,
  writeReportFile
};
