'use strict';

/**
 * storedRateLimitProvider — reads `domain_rate_limits` so stored preset/learned rates
 * are honoured as a pacing floor (owner decision 2026-07-26 #2: "be more polite,
 * accept slower").
 *
 * Extracted from CrawlerServiceWiring so the SEAM IS TESTABLE. Cycle 14 shipped this
 * logic inline and it was a silent no-op: `crawler.dbAdapter.db` was assumed to be a
 * better-sqlite3 handle, but it is a NewsDatabase whose OWN `.db` is the raw handle, so
 * the lookup returned null and no floor was ever applied — past 14 green unit tests,
 * because those tests injected a fake provider and never exercised the real adapter.
 * A test of a COPY of this logic would have guarded nothing; it has to be this function.
 */

/**
 * Find the object that can actually run SQL, by probing rather than asserting a path.
 * Layers seen in practice: CrawlerDb (wrapper) -> NewsDatabase -> better-sqlite3.
 * @returns {object|null} the first candidate exposing a callable `prepare`
 */
function resolveSqliteHandle(adapter) {
  if (!adapter) return null;
  const candidates = [
    adapter.db && adapter.db.db,
    adapter.db,
    adapter,
    adapter.database,
    adapter.db && adapter.db.database
  ];
  return candidates.find((c) => c && typeof c.prepare === 'function') || null;
}

const LOOKUP_SQL = `
  SELECT crawl_delay_seconds, safe_rpm, learned_rpm, source
    FROM domain_rate_limits
   WHERE domain = ? OR domain = ?
ORDER BY COALESCE(safe_rpm, learned_rpm, 999999) ASC
   LIMIT 1`;

/**
 * Build the provider DomainThrottleManager consumes: (normalisedHost) -> row | null.
 * The manager already normalises the host and caches per host, so this stays a plain
 * lookup. Any failure returns null, which leaves pacing exactly as it was — the safe
 * failure mode, so a DB problem can never make the crawler MORE aggressive.
 *
 * @param {() => object} getAdapter late-bound: the adapter is assigned after wiring.
 */
function createStoredRateLimitProvider(getAdapter) {
  return function storedRateLimitProvider(normalizedHost) {
    if (!normalizedHost) return null;
    try {
      const db = resolveSqliteHandle(typeof getAdapter === 'function' ? getAdapter() : getAdapter);
      if (!db) return null;
      // Match either stored key form; the table holds both bare and `www.` rows.
      return db.prepare(LOOKUP_SQL).get(normalizedHost, `www.${normalizedHost}`) || null;
    } catch (_) {
      return null;
    }
  };
}

module.exports = { resolveSqliteHandle, createStoredRateLimitProvider, LOOKUP_SQL };
