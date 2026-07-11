'use strict';

/**
 * tools/crawl/lib/sample-db-signals.js
 *
 * Read a writer/sample crawl DB (read-only) and turn it into the quality
 * signals consumed by quality-scorecard.js. Split into:
 *   - deriveSignals(...)   PURE: query rows/snapshot -> signals (unit-testable)
 *   - queryRawSignals(db)  runs the SQL against an open better-sqlite3 handle
 *   - readSampleDbSignals  opens the DB read-only and wires the two together
 *
 * Headline counts (downloads/responses/failed) come from the shared
 * getCloudCrawlDatabaseSnapshot so they match the rest of the toolchain. Richer
 * signals (status taxonomy, host coverage, dedup, freshness) are queried from
 * whichever response table the crawl populated: some crawls write `http_responses`
 * (with etag/last_modified), older/place-hub crawls populate `fetches` (with a
 * `host` column but no validators). We prefer whichever holds this run's rows.
 *
 * READ-ONLY: never starts a crawler, contacts a host, writes rows, or mutates a
 * queue.
 */

const path = require('path');

const EMPTY_TOTALS = Object.freeze({ urls: 0, responses: 0, successResponses: 0, failedResponses: 0, content: 0 });

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function totalsOf(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ...EMPTY_TOTALS };
  const t = snapshot.totals && typeof snapshot.totals === 'object' ? snapshot.totals : snapshot;
  return {
    urls: num(t.urls),
    responses: num(t.responses),
    successResponses: num(t.successResponses),
    failedResponses: num(t.failedResponses),
    content: num(t.content),
  };
}

/**
 * Turn a status-taxonomy map into rate-limit / server-error counts.
 * @param {Object<string,number>} taxonomy
 */
function classifyStatuses(taxonomy = {}) {
  let rateLimited = 0;
  let serverErrors = 0;
  let clientErrors = 0;
  let success = 0;
  let notModified = 0;
  let notFound = 0;
  for (const [code, count] of Object.entries(taxonomy)) {
    const status = Number(code);
    const n = num(count);
    if (status === 429) rateLimited += n;
    if (status >= 500 && status < 600) serverErrors += n;
    if (status >= 400 && status < 500) clientErrors += n;
    if (status >= 200 && status < 300) success += n;
    if (status === 304) notModified += n;
    if (status === 404 || status === 410) notFound += n;
  }
  return { rateLimited, serverErrors, clientErrors, success, notModified, notFound };
}

// Infrastructure requests (robots.txt, sitemap XML) are real fetches worth
// recording, but they are not CONTENT: they must not dilute content-quality
// metrics. SQL twin of this predicate: INFRA_URL_SQL_PREDICATE.
const INFRA_URL_SQL_PREDICATE = "(url LIKE '%/robots.txt' OR (url LIKE '%sitemap%' AND url LIKE '%.xml'))";

function isInfraUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('/robots.txt') || (pathname.includes('sitemap') && pathname.endsWith('.xml'));
  } catch (_) {
    return false;
  }
}

/**
 * PURE. Self-clocked throughput from DB fetch timestamps (never harness
 * wall-clock: session-clock vs file-timestamp skew produced negative elapsed
 * in earlier scaled runs). Window = first request start -> last fetch end.
 *
 * Binding constraint:
 *   politeness-bound — the crawler idles most of the window (pacing waits)
 *   latency-bound    — busy, and time-to-first-byte dominates transfer time
 *   bandwidth-bound  — busy, and transfer time dominates
 *
 * @param {object} timing { windowStartIso, windowEndIso, busyMs, avgTtfbMs, avgDownloadMs }
 * @param {number} responses
 * @param {number} bytesDownloaded
 * @returns {object|null} { docsPerSec, bytesPerSec, windowSec, busyFraction, bindingConstraint, basis }
 */
function deriveThroughput(timing, responses, bytesDownloaded) {
  if (!timing || typeof timing !== 'object') return null;
  const start = Date.parse(timing.windowStartIso || '');
  const end = Date.parse(timing.windowEndIso || '');
  const nResponses = num(responses, 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || nResponses <= 0) return null;
  const windowSec = (end - start) / 1000;
  const busyMs = Math.max(0, num(timing.busyMs, 0));
  const busyFraction = Math.min(1, busyMs / (end - start));
  const avgTtfb = num(timing.avgTtfbMs, 0);
  const avgDownload = num(timing.avgDownloadMs, 0);
  let bindingConstraint;
  if (busyFraction < 0.5) bindingConstraint = 'politeness-bound';
  else if (avgTtfb >= avgDownload) bindingConstraint = 'latency-bound';
  else bindingConstraint = 'bandwidth-bound';
  return {
    docsPerSec: nResponses / windowSec,
    bytesPerSec: num(bytesDownloaded, 0) / windowSec,
    windowSec,
    busyFraction,
    bindingConstraint,
    basis: 'db-timestamps',
  };
}

/**
 * PURE. Combine a current snapshot, optional baseline snapshot, and raw query
 * rows into the scorecard signal bag.
 *
 * @param {object} input
 * @param {object} input.snapshot      Current getCloudCrawlDatabaseSnapshot result.
 * @param {object} [input.baseline]    Pre-crawl snapshot (for delta on an accumulating DB).
 * @param {Object<string,number>} [input.taxonomy] status -> count for this run.
 * @param {number} [input.distinctHostsFetched]
 * @param {number} [input.distinctHostsDiscovered]
 * @param {object} [input.dedup]       { total, distinct }
 * @param {object} [input.freshness]   { etag, lastModified, notModified }
 * @param {number} [input.bytesDownloaded]
 * @param {object} [input.timing]      { windowStartIso, windowEndIso, busyMs, avgTtfbMs, avgDownloadMs }
 * @param {string[]|number} [input.requestedHosts]
 * @param {number} [input.elapsedSec]
 * @param {number} [input.launchExitCode]
 * @param {boolean} [input.stalled]
 * @returns {object} signals
 */
function deriveSignals(input = {}) {
  const current = totalsOf(input.snapshot);
  const baseline = input.baseline != null ? totalsOf(input.baseline) : null;
  // Prefer content-only counts (infra-excluded taxonomy) when the query layer
  // provides them; otherwise fall back to whole-DB snapshot math.
  const content = input.contentCounts && Number.isFinite(Number(input.contentCounts.responses))
    ? { responses: num(input.contentCounts.responses), downloads: num(input.contentCounts.downloads) }
    : null;
  const downloads = content
    ? content.downloads
    : (baseline ? Math.max(0, current.successResponses - baseline.successResponses) : current.successResponses);
  const responses = content
    ? content.responses
    : (baseline ? Math.max(0, current.responses - baseline.responses) : current.responses);
  const failedResponses = content
    ? Math.max(0, responses - downloads)
    : (baseline ? Math.max(0, current.failedResponses - baseline.failedResponses) : current.failedResponses);
  const taxonomy = input.taxonomy || {};
  const classified = classifyStatuses(taxonomy);

  const dedupTotal = input.dedup ? num(input.dedup.total, responses) : responses;
  const dedupDistinct = input.dedup ? num(input.dedup.distinct, dedupTotal) : dedupTotal;
  const duplicateResponses = Math.max(0, dedupTotal - dedupDistinct);

  const fresh = input.freshness || {};

  // Success rate measures FETCH RELIABILITY over content requests:
  //  - 304 Not-Modified counts as success (a working conditional re-fetch);
  //  - 404/410 discovery misses are excluded from the denominator (the server
  //    answered fine; the URL was a bad guess — that is URL-selection quality,
  //    itemized separately, not fetch failure).
  const reliabilityDenominator = responses - classified.notFound;
  const successRate = responses > 0 && reliabilityDenominator > 0
    ? Math.min(1, (downloads + classified.notModified) / reliabilityDenominator)
    : null;

  return {
    downloads,
    responses,
    failedResponses,
    successRate,
    notModifiedCount: classified.notModified,
    notFoundCount: classified.notFound,
    infra: input.infra || null,
    statusTaxonomy: taxonomy,
    rateLimitedCount: classified.rateLimited,
    serverErrorCount: classified.serverErrors,
    clientErrorCount: classified.clientErrors,
    distinctHostsFetched: num(input.distinctHostsFetched, 0),
    distinctHostsDiscovered: num(input.distinctHostsDiscovered, 0),
    requestedHosts: input.requestedHosts != null ? input.requestedHosts : [],
    stalled: input.stalled === true,
    freshness: {
      etag: num(fresh.etag, 0),
      lastModified: num(fresh.lastModified, 0),
      notModified: num(fresh.notModified, 0),
    },
    dedup: {
      totalResponses: dedupTotal,
      distinctUrls: dedupDistinct,
      duplicateResponses,
    },
    bytesDownloaded: num(input.bytesDownloaded, 0),
    throughput: deriveThroughput(input.timing, responses, input.bytesDownloaded),
    elapsedSec: input.elapsedSec != null ? num(input.elapsedSec) : null,
    launchExitCode: input.launchExitCode != null ? num(input.launchExitCode) : null,
  };
}

function tableRowCount(db, table, sinceClause, sinceArgs) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${sinceClause}`).get(...sinceArgs);
    return num(row && row.n, 0);
  } catch (_err) {
    return 0;
  }
}

/**
 * Run the signal SQL against an open (read-only) better-sqlite3 handle.
 * Chooses the response table that actually holds this run's rows.
 *
 * @param {object} db  Open better-sqlite3 database.
 * @param {object} [opts]
 * @param {string} [opts.sinceIso]  Only count rows with fetched_at >= this ISO.
 * @param {function} [opts.snapshotFn] Injectable snapshot function.
 * @returns {object} raw signal inputs for deriveSignals
 */
function queryRawSignals(db, opts = {}) {
  const sinceIso = opts.sinceIso || null;
  const snapshotFn = opts.snapshotFn
    || ((d) => require('../../../src/data/db/queries/downloadEvidence').getCloudCrawlDatabaseSnapshot(d, { path: 'sample-db-signals' }));
  const snapshot = snapshotFn(db);

  const sinceClause = sinceIso ? 'WHERE fetched_at >= ?' : '';
  const sinceArgs = sinceIso ? [sinceIso] : [];

  const httpCount = tableRowCount(db, 'http_responses', sinceClause, sinceArgs);
  const fetchesCount = tableRowCount(db, 'fetches', sinceClause, sinceArgs);
  const useHttp = httpCount >= fetchesCount; // prefer the richer table on ties
  const table = useHttp ? 'http_responses' : 'fetches';

  // Content metrics exclude infrastructure fetches (robots/sitemap): those are
  // recorded for visibility but must not dilute content-quality signals.
  const infraExclusion = useHttp
    ? `url_id NOT IN (SELECT id FROM urls WHERE ${INFRA_URL_SQL_PREDICATE})`
    : null;
  const contentWhere = [sinceIso ? 'fetched_at >= ?' : null, infraExclusion].filter(Boolean).join(' AND ');
  const contentClause = contentWhere ? `WHERE ${contentWhere}` : '';

  const safe = (fn, fallback) => { try { return fn(); } catch (_e) { return fallback; } };

  const taxonomy = {};
  safe(() => {
    const rows = db.prepare(`SELECT http_status AS s, COUNT(*) AS n FROM ${table} ${contentClause} GROUP BY http_status`).all(...sinceArgs);
    for (const r of rows) {
      if (r.s == null) continue;
      taxonomy[String(r.s)] = num(r.n);
    }
  }, null);

  // Infrastructure fetch summary (visibility evidence, informational).
  const infra = useHttp ? safe(() => {
    const row = db.prepare(
      `SELECT COUNT(*) AS responses,
              SUM(CASE WHEN u.url LIKE '%/robots.txt' THEN 1 ELSE 0 END) AS robots,
              SUM(CASE WHEN u.url LIKE '%sitemap%' AND u.url LIKE '%.xml' THEN 1 ELSE 0 END) AS sitemaps,
              SUM(CASE WHEN r.http_status >= 200 AND r.http_status < 300 THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN r.http_status IN (404, 410) THEN 1 ELSE 0 END) AS missing
       FROM http_responses r JOIN urls u ON u.id = r.url_id
       WHERE (u.url LIKE '%/robots.txt' OR (u.url LIKE '%sitemap%' AND u.url LIKE '%.xml'))
         ${sinceIso ? 'AND r.fetched_at >= ?' : ''}`
    ).get(...sinceArgs);
    const responses = num(row?.responses);
    if (!responses) return null;
    return {
      responses,
      robots: num(row?.robots),
      sitemapProbes: num(row?.sitemaps),
      ok: num(row?.ok),
      notFound: num(row?.missing),
    };
  }, null) : null;

  let distinctHostsFetched = 0;
  if (useHttp) {
    distinctHostsFetched = safe(() => num(db.prepare(
      `SELECT COUNT(DISTINCT u.host) AS n FROM http_responses r JOIN urls u ON u.id = r.url_id ${sinceIso ? 'WHERE r.fetched_at >= ?' : ''}`
    ).get(...sinceArgs)?.n, 0), 0);
  } else {
    distinctHostsFetched = safe(() => num(db.prepare(
      `SELECT COUNT(DISTINCT host) AS n FROM fetches ${sinceClause}`
    ).get(...sinceArgs)?.n, 0), 0);
  }

  const distinctHostsDiscovered = safe(() => num(db.prepare('SELECT COUNT(DISTINCT host) AS n FROM urls').get()?.n, 0), 0);

  const dedup = safe(() => {
    const key = useHttp ? 'url_id' : 'url';
    const row = db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT ${key}) AS distinct_urls FROM ${table} ${contentClause}`).get(...sinceArgs);
    return { total: num(row?.total), distinct: num(row?.distinct_urls) };
  }, { total: 0, distinct: 0 });

  // Freshness validators only exist on http_responses.
  const freshness = useHttp ? safe(() => {
    const row = db.prepare(
      `SELECT SUM(CASE WHEN etag IS NOT NULL AND etag <> '' THEN 1 ELSE 0 END) AS etag,
              SUM(CASE WHEN last_modified IS NOT NULL AND last_modified <> '' THEN 1 ELSE 0 END) AS lastmod,
              SUM(CASE WHEN http_status = 304 THEN 1 ELSE 0 END) AS c304
       FROM http_responses ${contentClause}`
    ).get(...sinceArgs);
    return { etag: num(row?.etag), lastModified: num(row?.lastmod), notModified: num(row?.c304) };
  }, { etag: 0, lastModified: 0, notModified: 0 }) : { etag: 0, lastModified: 0, notModified: 0 };

  const bytesDownloaded = safe(() => num(db.prepare(
    `SELECT COALESCE(SUM(bytes_downloaded), 0) AS bytes FROM ${table} ${contentClause}`
  ).get(...sinceArgs)?.bytes, 0), 0);

  // Content-only headline counts derived from the (windowed, infra-excluded)
  // taxonomy, so robots/sitemap fetches don't inflate downloads.
  const contentCounts = useHttp ? (() => {
    let responses = 0;
    let downloads = 0;
    for (const [code, count] of Object.entries(taxonomy)) {
      const status = Number(code);
      const n = num(count);
      responses += n;
      if (status >= 200 && status < 300) downloads += n;
    }
    return { responses, downloads };
  })() : null;

  // Fetch-event timing for self-clocked throughput. Columns beyond fetched_at
  // only exist on http_responses; on the fetches table the window degrades to
  // fetched_at-only and busy/ttfb/download stay 0 (throughput still computes).
  const timing = safe(() => {
    const cols = useHttp
      ? `MIN(COALESCE(request_started_at, fetched_at)) AS ws, MAX(fetched_at) AS we,
         COALESCE(SUM(total_ms), 0) AS busy, AVG(ttfb_ms) AS ttfb, AVG(download_ms) AS dl`
      : 'MIN(fetched_at) AS ws, MAX(fetched_at) AS we, 0 AS busy, NULL AS ttfb, NULL AS dl';
    const row = db.prepare(`SELECT ${cols} FROM ${table} ${contentClause}`).get(...sinceArgs);
    if (!row || !row.ws || !row.we) return null;
    return {
      windowStartIso: row.ws,
      windowEndIso: row.we,
      busyMs: num(row.busy, 0),
      avgTtfbMs: num(row.ttfb, 0),
      avgDownloadMs: num(row.dl, 0),
    };
  }, null);

  return { snapshot, taxonomy, distinctHostsFetched, distinctHostsDiscovered, dedup, freshness, bytesDownloaded, timing, infra, contentCounts, sourceTable: table };
}

/**
 * Seed-fetch evidence: did each requested start URL actually get a recorded
 * response this run? A 404 row still counts (the crawler TRIED); only a
 * missing row means the operator's URL was never fetched.
 */
function querySeedFetch(db, requestedUrls, sinceIso) {
  const urls = Array.isArray(requestedUrls) ? requestedUrls.filter((u) => typeof u === 'string' && u) : [];
  if (!urls.length) return null;
  const missing = [];
  let fetched = 0;
  for (const url of urls) {
    let n = 0;
    try {
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM http_responses r JOIN urls u ON u.id = r.url_id
         WHERE u.url = ? ${sinceIso ? 'AND r.fetched_at >= ?' : ''}`
      ).get(...(sinceIso ? [url, sinceIso] : [url]));
      n = num(row?.n, 0);
    } catch (_e) { n = 0; }
    if (n > 0) fetched += 1;
    else missing.push(url);
  }
  return { requested: urls.length, fetched, missing };
}

class NativeDbUnavailableError extends Error {
  constructor(cause) {
    super(
      'Crawl DB layer could not load its native SQLite module. This usually means '
      + 'better-sqlite3 was built for a different Node version.\n'
      + '  Fix:  cd ../news-crawler-db && npm rebuild better-sqlite3\n'
      + `  Cause: ${cause && cause.message ? cause.message : cause}`
    );
    this.name = 'NativeDbUnavailableError';
    this.code = 'NATIVE_DB_UNAVAILABLE';
    this.cause = cause;
  }
}

function isNativeLoadError(err) {
  const msg = String(err && err.message || err || '');
  return /ERR_DLOPEN_FAILED|not a valid Win32 application|was compiled against a different Node\.js version|invalid ELF header|\.node/i.test(msg);
}

/**
 * Open the sample DB read-only and compute signals. Wraps native-load failures
 * in a self-explaining error.
 *
 * @param {string} dbPath
 * @param {object} [opts]
 * @param {object} [opts.baseline]     Pre-crawl snapshot for delta math.
 * @param {string} [opts.sinceIso]
 * @param {string[]|number} [opts.requestedHosts]
 * @param {number} [opts.elapsedSec]
 * @param {number} [opts.launchExitCode]
 * @param {boolean} [opts.stalled]
 * @param {object} [opts.deps]         { openDb, snapshotFn } for tests.
 * @returns {object} signals (deriveSignals output) + { sourceTable, snapshot }
 */
/**
 * Wait for the sample DB's fetch evidence to stop changing before scoring.
 *
 * Why: run.js can exit (watch timeout) while the auto-spawned UI child is
 * still committing rows; scoring immediately then reads a snapshot that is
 * about to grow, producing false "0 downloads" FAILs (observed cycle 15,
 * root-caused 2026-07-07). Two consecutive identical readings = settled.
 *
 * @param {string} dbPath
 * @param {object} [opts] { tries=5, intervalMs=1500, readCounts, sleep }
 *        readCounts(dbPath) -> comparable value (string/number) — injectable.
 * @returns {Promise<{settled: boolean, polls: number, last: *}>}
 */
async function waitForEvidenceSettle(dbPath, opts = {}) {
  const tries = Number.isFinite(opts.tries) ? opts.tries : 5;
  const intervalMs = Number.isFinite(opts.intervalMs) ? opts.intervalMs : 1500;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const readCounts = opts.readCounts || ((p) => {
    const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
    const db = openNewsCrawlerDb(path.resolve(p), { readonly: true });
    try {
      const one = (sql) => { try { return db.prepare(sql).get().n; } catch (_e) { return 0; } };
      return [
        one('SELECT COUNT(*) AS n FROM http_responses'),
        one('SELECT COUNT(*) AS n FROM content_storage'),
        one('SELECT COUNT(*) AS n FROM fetches')
      ].join('/');
    } finally {
      try { db.close(); } catch (_e) { /* ignore */ }
    }
  });

  let prev = null;
  for (let i = 1; i <= tries; i++) {
    let cur;
    try { cur = readCounts(dbPath); } catch (_e) { cur = `err:${i}`; }
    if (prev !== null && cur === prev) return { settled: true, polls: i, last: cur };
    prev = cur;
    if (i < tries) await sleep(intervalMs);
  }
  return { settled: false, polls: tries, last: prev };
}

function readSampleDbSignals(dbPath, opts = {}) {
  const resolved = path.resolve(dbPath);
  const deps = opts.deps || {};
  const openDb = deps.openDb
    || ((p) => require('../../../src/db/openNewsCrawlerDb').openNewsCrawlerDb(p, { readonly: true }));
  let db;
  try {
    db = openDb(resolved);
  } catch (err) {
    if (isNativeLoadError(err)) throw new NativeDbUnavailableError(err);
    throw err;
  }
  try {
    const raw = queryRawSignals(db, { sinceIso: opts.sinceIso, snapshotFn: deps.snapshotFn });
    const seedFetch = querySeedFetch(db, opts.requestedUrls, opts.sinceIso);
    const signals = deriveSignals({
      snapshot: raw.snapshot,
      baseline: opts.baseline || null,
      taxonomy: raw.taxonomy,
      distinctHostsFetched: raw.distinctHostsFetched,
      distinctHostsDiscovered: raw.distinctHostsDiscovered,
      dedup: raw.dedup,
      freshness: raw.freshness,
      bytesDownloaded: raw.bytesDownloaded,
      timing: raw.timing,
      infra: raw.infra,
      contentCounts: raw.contentCounts,
      requestedHosts: opts.requestedHosts,
      elapsedSec: opts.elapsedSec,
      launchExitCode: opts.launchExitCode,
      stalled: opts.stalled,
    });
    return Object.assign(signals, { seedFetch, sourceTable: raw.sourceTable, snapshot: raw.snapshot });
  } finally {
    if (db && typeof db.close === 'function') { try { db.close(); } catch (_e) { /* ignore */ } }
  }
}

module.exports = {
  EMPTY_TOTALS,
  totalsOf,
  classifyStatuses,
  isInfraUrl,
  INFRA_URL_SQL_PREDICATE,
  querySeedFetch,
  deriveThroughput,
  deriveSignals,
  queryRawSignals,
  waitForEvidenceSettle,
  readSampleDbSignals,
  NativeDbUnavailableError,
  isNativeLoadError,
};
