#!/usr/bin/env node
'use strict';

/**
 * fixture-crawl-runner.js — run ONE crawl against a given URL with explicit options.
 *
 * Bypasses `src/crawl.js` deliberately. That CLI hard-codes its config path
 * (`src/crawl.js:34`) to the repo-root `crawl.js.config.json`, and merges as
 * `[...configArgv, ...directArgv]` with the config's `startUrl` at position 0
 * (`configArgs.js:237`) — so the first positional wins and a start URL passed on the
 * command line is IGNORED. Measured 2026-07-26: a benchmark aimed at a local fixture
 * silently crawled https://www.theguardian.com instead. The fixture's own request
 * counter (0 requests) is what exposed it.
 *
 * A benchmark must not depend on ambient config, so this constructs NewsCrawler directly.
 *
 *   node tools/perf/fixture-crawl-runner.js <url> <concurrency> <maxPages> <dbPath>
 */

const NewsCrawler = require('../../src/core/crawler/NewsCrawler');

const [, , url, concStr, maxPagesStr, dbPath, enableDbStr] = process.argv;
if (!url || !concStr || !maxPagesStr || !dbPath) {
  console.error('usage: fixture-crawl-runner.js <url> <concurrency> <maxPages> <dbPath> [enableDb 0|1]');
  process.exit(2);
}
// enableDb defaults ON. Turning it OFF is how the post-fetch cost is decomposed:
// (DB on) - (DB off) = the persistence share of per-page processing.
const enableDb = enableDbStr === undefined ? true : enableDbStr !== '0';

(async () => {
  const crawler = new NewsCrawler(url, {
    concurrency: Number(concStr),
    maxDownloads: Number(maxPagesStr),
    maxDepth: 6,
    dbPath,
    useSitemap: false,      // remove sitemap variance from the measurement
    preferCache: false,     // never serve a cached page — every page must be fetched
    fastStart: true,
    enableDb,
    slowMode: false,
    rateLimitMs: 0
  });
  try {
    await crawler.crawl();
    console.log('RUNNER_OK');
  } catch (err) {
    console.error('RUNNER_ERR ' + (err && err.message ? err.message : String(err)));
    process.exitCode = 1;
  } finally {
    // Best-effort teardown so the process can exit promptly between reps.
    try { if (crawler.dbAdapter && typeof crawler.dbAdapter.close === 'function') crawler.dbAdapter.close(); } catch (_) { /* ignore */ }
    setTimeout(() => process.exit(process.exitCode || 0), 250).unref();
  }
})();
