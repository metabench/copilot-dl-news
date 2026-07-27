#!/usr/bin/env node
'use strict';

/**
 * frontier-stats.js — compute the DB crawl-frontier summary and print it as JSON.
 *
 * Read-only over data/news.db. Spawned by the unified server on an interval
 * (the count is a ~4-5s full urls scan; running it in the request would block
 * the synchronous better-sqlite3 event loop, so it lives in a child process and
 * the server caches the result — same pattern as country-download-stats.js).
 *
 * All frontier SQL lives in ncdb (countCrawlFrontier / selectCrawlFrontierByHost /
 * countHubRefreshFrontier); this script is just the process boundary. Prints
 * {total, disallowed, crawlable, hosts:[{host,count}], hubTotal, hubDisallowed,
 * hubNeverDownloaded, hubStale, recencyMsHub, generatedAt, computeMs}.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { countCrawlFrontier, selectCrawlFrontierByHost, countHubRefreshFrontier } = require('news-crawler-db');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const LIMIT = Number(getArg('--limit', 15));
const RECENCY_MS_HUB = Number(getArg('--recency-ms', 24 * 60 * 60 * 1000));

const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: true, fileMustExist: true });
try {
  const t0 = Date.now();
  const counts = countCrawlFrontier(db);
  const byHost = selectCrawlFrontierByHost(db, { limit: LIMIT });
  const hubStats = countHubRefreshFrontier(db, { recencyMsHub: RECENCY_MS_HUB });
  process.stdout.write(JSON.stringify({
    total: counts.total,
    disallowed: counts.disallowed,
    crawlable: counts.crawlable,
    hosts: byHost.hosts,
    hubTotal: hubStats.hubTotal,
    hubDisallowed: hubStats.hubDisallowed,
    hubNeverDownloaded: hubStats.hubNeverDownloaded,
    hubStale: hubStats.hubStale,
    hubDead: hubStats.hubDead,
    hubLowValue: hubStats.hubLowValue,
    deadHubAfter: hubStats.deadHubAfter,
    recencyMsHub: hubStats.recencyMsHub,
    generatedAt: counts.generatedAt,
    computeMs: Date.now() - t0
  }));
} finally {
  db.close();
}
