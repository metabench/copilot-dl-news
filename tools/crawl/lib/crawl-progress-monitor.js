'use strict';

/**
 * tools/crawl/lib/crawl-progress-monitor.js
 *
 * Writer-DB-aware crawl-progress monitor for AGENTIC scaled crawl runs.
 *
 * Why this exists
 * ---------------
 * When `tools/crawl/run.js --crawl-db <sample.db>` redirects the crawl WRITER
 * to a sample DB, the existing live throughput meter and the
 * `--watch-min-fetches` gate keep polling the DEFAULT production DB
 * (`data/news.db`). A successful isolated crawl therefore looks like
 * `fetched=0` and exits 2 even though the sample DB is growing (proven
 * 2026-05-31: sample delta +16 responses / +6 content, production delta 0).
 *
 * This monitor closes that gap: it reads the WRITER DB the operator actually
 * redirected the crawl to, and emits a compact, machine-readable
 * crawl-progress packet an agent can poll on a cadence to methodically watch a
 * scaled crawl (1000 downloads, then larger) toward an explicit target.
 *
 * Boundaries
 * ----------
 * - READ-ONLY. Opens the writer DB read-only; never starts a crawler, contacts
 *   a remote host, writes DB rows, or mutates a queue.
 * - The packet math (`buildCrawlProgressPacket`) is a PURE function of
 *   deterministic numeric inputs, so it is unit-testable without a DB.
 * - The DB sampler (`sampleWriterDb`) is injectable, so tests pass fake
 *   snapshots.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DEFAULT_STALL_TIMEOUT_MS = 60000;
const NO_DOWNLOAD_GRACE_MS = 10000;
const HIGH_FAILURE_MIN_SAMPLE = 5;
const HIGH_FAILURE_RATIO = 0.5;

function toNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Extract the numeric totals from a cloud-crawl DB snapshot (the shape returned
 * by `getCloudCrawlDatabaseSnapshot`: `{ totals: { urls, responses,
 * successResponses, failedResponses, content }, latestFetchedAt }`). Tolerates
 * a flattened snapshot (totals merged onto the top level) and a null snapshot.
 */
function snapshotTotals(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0 };
  }
  const totals = snapshot.totals && typeof snapshot.totals === 'object' ? snapshot.totals : snapshot;
  return {
    urls: toNonNegativeInt(totals.urls),
    responses: toNonNegativeInt(totals.responses),
    successResponses: toNonNegativeInt(totals.successResponses),
    failedResponses: toNonNegativeInt(totals.failedResponses),
    content: toNonNegativeInt(totals.content),
  };
}

function parseIsoMs(value) {
  if (!value) return null;
  const ms = Date.parse(String(value).replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Self-clocking elapsed: derive elapsed ms from two DB samples' `latestFetchedAt`
 * timestamps instead of trusting a harness wall-clock (which produced a NEGATIVE
 * −3.5M ms reading on 2026-05-31 from a session-clock vs file-timestamp skew).
 * PURE. Returns null when either timestamp is missing/unparseable so the caller
 * can fall back to an explicit `--elapsed-ms`. Never returns a negative value:
 * a backwards skew (current older than baseline) clamps to 0.
 *
 * @param {string|null} baselineIso  baseline snapshot latestFetchedAt
 * @param {string|null} currentIso   current snapshot latestFetchedAt
 * @returns {number|null} elapsed ms (>= 0) or null when not derivable
 */
function deriveElapsedFromSamples(baselineIso, currentIso) {
  const baseMs = parseIsoMs(baselineIso);
  const curMs = parseIsoMs(currentIso);
  if (baseMs == null || curMs == null) return null;
  return Math.max(0, curMs - baseMs);
}

/**
 * Build the crawl-progress packet from deterministic inputs. PURE.
 *
 * @param {object} input
 * @param {string} [input.writerDbPath]      Path to the writer (sample) DB.
 * @param {boolean} [input.writerDbExists]   Whether that DB file exists.
 * @param {number}  [input.targetDownloads]  Operator target (e.g. 1000). 0/undefined => no target.
 * @param {number}  input.elapsedMs          Elapsed crawl time in ms.
 * @param {object}  input.current            Current DB snapshot (with .totals + latestFetchedAt).
 * @param {object}  [input.baseline]         Pre-crawl snapshot for growth/anomaly math, or null.
 * @param {object}  [input.previous]         Prior sample `{ elapsedMs, downloads, bytes }` for instantaneous rate.
 * @param {number}  [input.currentBytes]     Cumulative bytes downloaded so far (optional).
 * @param {number|null} [input.distinctHosts] Distinct hosts seen (optional).
 * @param {number}  [input.stallTimeoutMs]   Stall threshold, default 60000.
 * @param {string}  [input.now]              ISO "now" for ETA + msSinceLastDownload.
 */
function buildCrawlProgressPacket(input = {}) {
  const nowIso = input.now || new Date().toISOString();
  const nowMs = parseIsoMs(nowIso) ?? Date.now();
  const stallTimeoutMs = input.stallTimeoutMs != null
    ? Math.max(1000, toFiniteNumber(input.stallTimeoutMs, DEFAULT_STALL_TIMEOUT_MS))
    : DEFAULT_STALL_TIMEOUT_MS;

  const current = snapshotTotals(input.current);
  const baseline = input.baseline != null ? snapshotTotals(input.baseline) : null;
  const latestFetchedAt = input.current && input.current.latestFetchedAt != null
    ? input.current.latestFetchedAt
    : null;
  const baselineLatestFetchedAt = input.baseline && input.baseline.latestFetchedAt != null
    ? input.baseline.latestFetchedAt
    : null;

  // SELF-CLOCKING: prefer elapsed derived from DB `latestFetchedAt` deltas over
  // any harness-supplied `--elapsed-ms` (which can be skewed/negative). The
  // explicit arg is only a fallback when the baseline carries no timestamp.
  const derivedElapsedMs = deriveElapsedFromSamples(baselineLatestFetchedAt, latestFetchedAt);
  const explicitElapsedProvided = input.elapsedMs != null && Number.isFinite(Number(input.elapsedMs));
  let elapsedMs;
  let elapsedSource;
  if (derivedElapsedMs != null) {
    elapsedMs = derivedElapsedMs;
    elapsedSource = 'db-latest-fetched-delta';
  } else if (explicitElapsedProvided) {
    elapsedMs = Math.max(0, Number(input.elapsedMs));
    elapsedSource = 'elapsed-ms-arg';
  } else {
    elapsedMs = 0;
    elapsedSource = 'none';
  }
  const elapsedSec = round(elapsedMs / 1000, 1);

  const downloads = current.successResponses;
  const contentDownloads = current.content;
  const successResponses = current.successResponses;
  const failedResponses = current.failedResponses;

  const target = toNonNegativeInt(input.targetDownloads, 0);
  const hasTarget = target > 0;
  const fraction = hasTarget ? clamp01(downloads / target) : null;
  const remaining = hasTarget ? Math.max(0, target - downloads) : null;
  const reached = hasTarget ? downloads >= target : false;

  // Throughput: instantaneous from `previous` if available, else cumulative average.
  let docsPerSec = 0;
  if (input.previous && Number.isFinite(input.previous.elapsedMs)) {
    const dtMs = elapsedMs - input.previous.elapsedMs;
    const dDocs = downloads - toFiniteNumber(input.previous.downloads, 0);
    docsPerSec = dtMs > 0 ? (dDocs / (dtMs / 1000)) : 0;
  } else if (elapsedMs > 0) {
    docsPerSec = downloads / (elapsedMs / 1000);
  }
  if (!Number.isFinite(docsPerSec) || docsPerSec < 0) docsPerSec = 0;

  let bytesPerSec = 0;
  const currentBytes = toFiniteNumber(input.currentBytes, 0);
  if (input.previous && Number.isFinite(input.previous.elapsedMs)) {
    const dtMs = elapsedMs - input.previous.elapsedMs;
    const dBytes = currentBytes - toFiniteNumber(input.previous.bytes, 0);
    bytesPerSec = dtMs > 0 ? (dBytes / (dtMs / 1000)) : 0;
  } else if (elapsedMs > 0 && currentBytes > 0) {
    bytesPerSec = currentBytes / (elapsedMs / 1000);
  }
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) bytesPerSec = 0;

  // DB growth vs baseline.
  let dbGrowth = null;
  if (baseline) {
    dbGrowth = {
      urls: current.urls - baseline.urls,
      responses: current.responses - baseline.responses,
      successResponses: current.successResponses - baseline.successResponses,
      content: current.content - baseline.content,
    };
  }

  // Stall detection: prefer DB freshness (latestFetchedAt vs now); fall back to
  // a flat downloads delta across two samples.
  const latestMs = parseIsoMs(latestFetchedAt);
  const msSinceLastDownload = latestMs != null ? Math.max(0, nowMs - latestMs) : null;
  let stalled = false;
  if (!reached && downloads > 0) {
    if (msSinceLastDownload != null && msSinceLastDownload >= stallTimeoutMs) {
      stalled = true;
    } else if (input.previous && Number.isFinite(input.previous.elapsedMs)) {
      const dtMs = elapsedMs - input.previous.elapsedMs;
      const dDocs = downloads - toFiniteNumber(input.previous.downloads, 0);
      if (dtMs >= stallTimeoutMs && dDocs <= 0) stalled = true;
    }
  }

  // Anomalies (neutral structural observations, not value judgements).
  const anomalies = [];
  if (baseline) {
    if (current.urls < baseline.urls
      || current.responses < baseline.responses
      || current.successResponses < baseline.successResponses
      || current.content < baseline.content) {
      anomalies.push('db-shrank-vs-baseline');
    }
  }
  if (downloads === 0 && elapsedMs >= NO_DOWNLOAD_GRACE_MS) {
    anomalies.push('no-downloads-yet');
  }
  const responseSample = successResponses + failedResponses;
  if (responseSample >= HIGH_FAILURE_MIN_SAMPLE
    && (failedResponses / responseSample) >= HIGH_FAILURE_RATIO) {
    anomalies.push('high-failure-ratio');
  }
  if (hasTarget && downloads > target) {
    anomalies.push('exceeded-target');
  }
  if (input.writerDbExists === false) {
    anomalies.push('writer-db-missing');
  }

  // Projected completion.
  let projectedCompletion = null;
  if (hasTarget && remaining != null && remaining > 0 && docsPerSec > 0) {
    const etaSec = round(remaining / docsPerSec, 1);
    const etaIso = new Date(nowMs + etaSec * 1000).toISOString();
    projectedCompletion = { etaSec, etaIso, basis: input.previous ? 'instantaneous-rate' : 'cumulative-rate' };
  } else if (reached) {
    projectedCompletion = { etaSec: 0, etaIso: nowIso, basis: 'target-reached' };
  }

  // Verdict.
  let verdict;
  if (reached) verdict = 'target-reached';
  else if (stalled) verdict = 'stalled';
  else if (downloads === 0) verdict = 'idle';
  else verdict = 'in-progress';

  return {
    mode: 'crawl-progress-monitor',
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso,
    actionPolicy: {
      readOnlyReport: true,
      startsCrawler: false,
      contactsRemote: false,
      writesLocalDb: false,
    },
    writerDb: {
      path: input.writerDbPath || null,
      exists: input.writerDbExists !== false,
    },
    target: { downloads: hasTarget ? target : null },
    elapsedSec,
    elapsedSource,
    downloads,
    contentDownloads,
    successResponses,
    failedResponses,
    distinctHosts: input.distinctHosts != null ? toNonNegativeInt(input.distinctHosts) : null,
    progress: {
      fraction: fraction != null ? round(fraction, 4) : null,
      percent: fraction != null ? round(fraction * 100, 1) : null,
      remaining,
      reached,
    },
    dbGrowth,
    throughput: {
      docsPerSec: round(docsPerSec, 3),
      bytesPerSec: round(bytesPerSec, 1),
    },
    latestFetchedAt,
    msSinceLastDownload,
    stalled,
    anomalies,
    projectedCompletion,
    verdict,
  };
}

function renderCrawlProgressText(packet) {
  const lines = [];
  lines.push('Crawl Progress Monitor');
  lines.push(`Writer DB: ${packet.writerDb.path || '(none)'}${packet.writerDb.exists ? '' : ' (MISSING)'}`);
  const targetTxt = packet.target.downloads != null ? String(packet.target.downloads) : '(none)';
  const pct = packet.progress.percent != null ? ` (${packet.progress.percent}%)` : '';
  lines.push(`Downloads: ${packet.downloads} / ${targetTxt}${pct}  content=${packet.contentDownloads}`);
  lines.push(`Responses: success=${packet.successResponses} failed=${packet.failedResponses}`);
  if (packet.dbGrowth) {
    lines.push(`DB growth: urls=${packet.dbGrowth.urls} responses=${packet.dbGrowth.responses} content=${packet.dbGrowth.content}`);
  }
  lines.push(`Throughput: ${packet.throughput.docsPerSec}/s docs, ${packet.throughput.bytesPerSec}/s bytes`);
  lines.push(`Elapsed: ${packet.elapsedSec}s (${packet.elapsedSource})  latestFetchedAt=${packet.latestFetchedAt || '-'}`);
  if (packet.projectedCompletion && packet.projectedCompletion.etaSec != null) {
    lines.push(`ETA: ${packet.projectedCompletion.etaSec}s (${packet.projectedCompletion.basis})`);
  }
  if (packet.anomalies.length) {
    lines.push(`Anomalies: ${packet.anomalies.join(', ')}`);
  }
  lines.push(`Verdict: ${packet.verdict}${packet.stalled ? ' [STALLED]' : ''}`);
  lines.push('No-action policy: read-only; does not start crawlers, contact remote hosts, or write DB rows.');
  return `${lines.join('\n')}\n`;
}

/**
 * Sample the writer DB read-only. Returns `{ ok, snapshot, bytes, exists }`.
 * Injectable via `deps.openDb` and `deps.snapshot` for testing.
 */
function sampleWriterDb(dbPath, deps = {}) {
  const resolved = path.resolve(dbPath);
  const exists = deps.existsSync ? deps.existsSync(resolved) : fs.existsSync(resolved);
  if (!exists) {
    return { ok: false, exists: false, snapshot: null, bytes: 0, reason: `writer-db-missing:${resolved}` };
  }
  const openDb = deps.openDb || ((p) => require('../../../src/db/openNewsCrawlerDb').openNewsCrawlerDb(p, { readonly: true }));
  const snapshotFn = deps.snapshot
    || ((db, opts) => require('news-crawler-db').getCloudCrawlDatabaseSnapshot(db, opts));
  const db = openDb(resolved);
  try {
    const snapshot = snapshotFn(db, { path: resolved, capturedAt: new Date().toISOString() });
    let bytes = 0;
    try {
      // Sum from http_responses first (fetches has been unpopulated since
      // ~2026-03); fall back to fetches for legacy DBs where it still wins.
      const sum = (table) => {
        try {
          const row = db.prepare(`SELECT COALESCE(SUM(bytes_downloaded), 0) AS bytes, COUNT(*) AS n FROM ${table}`).get();
          return { bytes: toFiniteNumber(row && row.bytes, 0), n: toFiniteNumber(row && row.n, 0) };
        } catch (_e) { return { bytes: 0, n: -1 }; }
      };
      const http = sum('http_responses');
      const legacy = sum('fetches');
      bytes = http.n >= legacy.n ? http.bytes : legacy.bytes;
    } catch (_err) {
      bytes = 0; // bytes are optional; tolerate missing table/column
    }
    return { ok: true, exists: true, snapshot, bytes };
  } finally {
    if (db && typeof db.close === 'function') db.close();
  }
}

/**
 * Orchestrate one progress sample: read the writer DB and build the packet.
 * Read-only. `options.baseline` may be a prior snapshot for growth math.
 */
function collectCrawlProgress(options = {}, deps = {}) {
  const dbPath = options.writerDbPath || options.dbPath;
  if (!dbPath) throw new Error('writerDbPath is required');
  const sample = (deps.sampleWriterDb || sampleWriterDb)(dbPath, deps);
  return buildCrawlProgressPacket({
    writerDbPath: dbPath,
    writerDbExists: sample.exists,
    targetDownloads: options.targetDownloads,
    elapsedMs: options.elapsedMs,
    current: sample.snapshot,
    baseline: options.baseline || null,
    previous: options.previous || null,
    currentBytes: sample.bytes,
    distinctHosts: options.distinctHosts != null ? options.distinctHosts : null,
    stallTimeoutMs: options.stallTimeoutMs,
    now: options.now,
  });
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_STALL_TIMEOUT_MS,
  snapshotTotals,
  deriveElapsedFromSamples,
  buildCrawlProgressPacket,
  renderCrawlProgressText,
  sampleWriterDb,
  collectCrawlProgress,
};
