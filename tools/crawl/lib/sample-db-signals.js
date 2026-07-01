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
  for (const [code, count] of Object.entries(taxonomy)) {
    const status = Number(code);
    const n = num(count);
    if (status === 429) rateLimited += n;
    if (status >= 500 && status < 600) serverErrors += n;
    if (status >= 400 && status < 500) clientErrors += n;
    if (status >= 200 && status < 300) success += n;
  }
  return { rateLimited, serverErrors, clientErrors, success };
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
 * @param {string[]|number} [input.requestedHosts]
 * @param {number} [input.elapsedSec]
 * @param {number} [input.launchExitCode]
 * @param {boolean} [input.stalled]
 * @returns {object} signals
 */
function deriveSignals(input = {}) {
  const current = totalsOf(input.snapshot);
  const baseline = input.baseline != null ? totalsOf(input.baseline) : null;
  const downloads = baseline ? Math.max(0, current.successResponses - baseline.successResponses) : current.successResponses;
  const responses = baseline ? Math.max(0, current.responses - baseline.responses) : current.responses;
  const failedResponses = baseline ? Math.max(0, current.failedResponses - baseline.failedResponses) : current.failedResponses;
  const taxonomy = input.taxonomy || {};
  const classified = classifyStatuses(taxonomy);

  const dedupTotal = input.dedup ? num(input.dedup.total, responses) : responses;
  const dedupDistinct = input.dedup ? num(input.dedup.distinct, dedupTotal) : dedupTotal;
  const duplicateResponses = Math.max(0, dedupTotal - dedupDistinct);

  const fresh = input.freshness || {};

  return {
    downloads,
    responses,
    failedResponses,
    successRate: responses > 0 ? downloads / responses : null,
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

  const safe = (fn, fallback) => { try { return fn(); } catch (_e) { return fallback; } };

  const taxonomy = {};
  safe(() => {
    const rows = db.prepare(`SELECT http_status AS s, COUNT(*) AS n FROM ${table} ${sinceClause} GROUP BY http_status`).all(...sinceArgs);
    for (const r of rows) {
      if (r.s == null) continue;
      taxonomy[String(r.s)] = num(r.n);
    }
  }, null);

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
    const row = db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT ${key}) AS distinct_urls FROM ${table} ${sinceClause}`).get(...sinceArgs);
    return { total: num(row?.total), distinct: num(row?.distinct_urls) };
  }, { total: 0, distinct: 0 });

  // Freshness validators only exist on http_responses.
  const freshness = useHttp ? safe(() => {
    const row = db.prepare(
      `SELECT SUM(CASE WHEN etag IS NOT NULL AND etag <> '' THEN 1 ELSE 0 END) AS etag,
              SUM(CASE WHEN last_modified IS NOT NULL AND last_modified <> '' THEN 1 ELSE 0 END) AS lastmod,
              SUM(CASE WHEN http_status = 304 THEN 1 ELSE 0 END) AS c304
       FROM http_responses ${sinceClause}`
    ).get(...sinceArgs);
    return { etag: num(row?.etag), lastModified: num(row?.lastmod), notModified: num(row?.c304) };
  }, { etag: 0, lastModified: 0, notModified: 0 }) : { etag: 0, lastModified: 0, notModified: 0 };

  const bytesDownloaded = safe(() => num(db.prepare(
    `SELECT COALESCE(SUM(bytes_downloaded), 0) AS bytes FROM ${table} ${sinceClause}`
  ).get(...sinceArgs)?.bytes, 0), 0);

  return { snapshot, taxonomy, distinctHostsFetched, distinctHostsDiscovered, dedup, freshness, bytesDownloaded, sourceTable: table };
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
    const signals = deriveSignals({
      snapshot: raw.snapshot,
      baseline: opts.baseline || null,
      taxonomy: raw.taxonomy,
      distinctHostsFetched: raw.distinctHostsFetched,
      distinctHostsDiscovered: raw.distinctHostsDiscovered,
      dedup: raw.dedup,
      freshness: raw.freshness,
      bytesDownloaded: raw.bytesDownloaded,
      requestedHosts: opts.requestedHosts,
      elapsedSec: opts.elapsedSec,
      launchExitCode: opts.launchExitCode,
      stalled: opts.stalled,
    });
    return Object.assign(signals, { sourceTable: raw.sourceTable, snapshot: raw.snapshot });
  } finally {
    if (db && typeof db.close === 'function') { try { db.close(); } catch (_e) { /* ignore */ } }
  }
}

module.exports = {
  EMPTY_TOTALS,
  totalsOf,
  classifyStatuses,
  deriveSignals,
  queryRawSignals,
  readSampleDbSignals,
  NativeDbUnavailableError,
  isNativeLoadError,
};
