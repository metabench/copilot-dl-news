#!/usr/bin/env node
'use strict';

/**
 * frontier-hosts.js — discover the top PROVEN-CRAWLABLE hosts that still have a
 * large never-fetched frontier, so a crawl drains a BROAD set of publishers
 * instead of the same ~6 (task, 2026-07-21).
 *
 * Why: the urls table already holds 15k+ distinct hosts, incl. ~20 major news
 * publishers with 10k-150k never-fetched URLs each (france24, irishtimes,
 * independent, abc, theglobeandmail, cnn, scmp, straitstimes, cbc, …). Aggregate
 * crawl throughput was capped not by seeding but by HYDRATE BREADTH — only the
 * few hosts a caller named got scheduled. More hosts = more polite fetches
 * overlapping a throttled host's crawl-delay idle (see the adaptive-limit +
 * crawl-gap-is-politeness findings).
 *
 * "Proven-crawlable" = the host already has >= minProven successful fetches
 * (status='done'), so we don't hydrate JS-walled/paywalled dead-ends. Ordered by
 * remaining frontier so the biggest untapped backlogs come first.
 *
 * Runs in ITS OWN process (read-only DB) — the GROUP BY is ~2s and must NEVER
 * run on the server event loop. Used both as a CLI and as a library by
 * frontier-fill.js (default host set).
 *
 *   node tools/crawl/frontier-hosts.js [--limit 12] [--min-proven 1000] [--min-frontier 5000]
 */

const path = require('path');
const { openNewsCrawlerDb } = require(path.resolve(__dirname, '..', '..', 'src', 'db', 'openNewsCrawlerDb'));

// Lazy, fault-tolerant article-shape classifier (the SAME looksLikeArticle the
// crawler uses). If it can't load, density degrades to "everything counts" so the
// tool falls back to pure frontier-size ranking rather than crashing.
let _signals = null;
function getSignals() {
  if (_signals) return _signals;
  try {
    const ArticleSignalsService = require(path.resolve(__dirname, '..', '..', 'src', 'core', 'crawler', 'ArticleSignalsService.js'));
    _signals = new ArticleSignalsService({});
  } catch (_) {
    _signals = { looksLikeArticle: () => true };
  }
  return _signals;
}

async function topProvenCrawlableHosts(db, { limit = 12, minProven = 1000, minFrontier = 5000, minYield = 0.6, density = true, densitySample = 800, minArticlePct = 0 } = {}) {
  const lim = Math.max(1, Math.min(100, Math.floor(Number(limit) || 12)));
  const mp = Math.max(0, Math.floor(Number(minProven) || 0));
  const mf = Math.max(0, Math.floor(Number(minFrontier) || 0));
  const my = Math.max(0, Math.min(1, Number(minYield)));
  // errored (status error|dead) → lifetime yield = done/(done+errored). A host
  // that turned paywalled/JS-walled accrues errors and its yield drops, so we
  // stop scheduling it (e.g. nytimes ~84% vs bbc/irishtimes/france24 98-100%).
  // Same GROUP BY — no extra query cost. Over-fetch, then filter+cap in JS so
  // the yield gate doesn't have to fight SQLite integer division.
  const rows = await db.query(
    `SELECT host,
            SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) frontier,
            SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) proven,
            SUM(CASE WHEN status IN ('error','dead') THEN 1 ELSE 0 END) errored
       FROM urls
      WHERE host IS NOT NULL
      GROUP BY host
     HAVING proven >= ? AND frontier >= ?
      ORDER BY frontier DESC
      LIMIT ?`,
    [mp, mf, lim * 3]
  );
  const candidates = rows
    .map((r) => {
      const proven = Number(r.proven) || 0;
      const errored = Number(r.errored) || 0;
      return { host: r.host, frontier: Number(r.frontier) || 0, proven, errored, yield: (proven + errored) ? proven / (proven + errored) : 1 };
    })
    .filter((r) => r.yield >= my);

  if (!density) return candidates.slice(0, lim);

  // Article-DENSITY ranking (2026-07-21): raw frontier size is dominated by
  // hub/section URLs for some hosts (bbc/france24/abc ~1-5% article-shaped) while
  // others are article-rich (guardian ~95%, apnews ~81%, irishtimes ~75%). Ordering
  // by raw frontier scheduled the hub-heavy hosts and headlines came out thin
  // (measured: tools/crawl/frontier-shape.js). Sample each candidate's pending URLs,
  // classify with the SAME looksLikeArticle the crawler uses, and rank by ESTIMATED
  // article backlog = frontier * articlePct — so auto-discovery prefers hosts that
  // actually yield fresh article headlines. Bounded: one indexed LIMIT query per
  // candidate; runs off-server.
  const signals = getSignals();
  const map = Math.max(0, Math.min(1, Number(minArticlePct) || 0));
  const sampleN = Math.max(50, Math.min(5000, Math.floor(Number(densitySample) || 800)));
  for (const c of candidates) {
    let sample = [];
    try { sample = await db.query(`SELECT url FROM urls WHERE host = ? AND status = 'pending' LIMIT ?`, [c.host, sampleN]); } catch (_) { sample = []; }
    const n = sample.length;
    const art = n ? sample.reduce((acc, r) => acc + (signals.looksLikeArticle(r.url) ? 1 : 0), 0) : 0;
    c.articlePct = n ? art / n : 0;
    c.estArticleFrontier = Math.round(c.frontier * c.articlePct);
  }
  return candidates
    .filter((c) => c.articlePct >= map)
    .sort((a, b) => b.estArticleFrontier - a.estArticleFrontier)
    .slice(0, lim);
}

// Standalone: open the DB read-only, print. When required as a lib, the caller
// passes its own db handle (no double-open).
async function discover({ limit, minProven, minFrontier, minYield, density, densitySample, minArticlePct } = {}) {
  const db = await openNewsCrawlerDb(path.resolve(__dirname, '..', '..', 'data', 'news.db'), { readonly: true, fileMustExist: true });
  try { return await topProvenCrawlableHosts(db, { limit, minProven, minFrontier, minYield, density, densitySample, minArticlePct }); }
  finally { await db.close(); }
}

module.exports = { topProvenCrawlableHosts, discover };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d; };
  discover({
    limit: arg('--limit', 12), minProven: arg('--min-proven', 1000), minFrontier: arg('--min-frontier', 5000), minYield: arg('--min-yield', 0.6),
    density: !argv.includes('--no-density'), densitySample: arg('--density-sample', 800), minArticlePct: arg('--min-article-pct', 0),
  })
    .then((hosts) => {
      const ranked = hosts.length && hosts[0].estArticleFrontier !== undefined;
      console.log(`top ${hosts.length} proven-crawlable frontier hosts (${ranked ? 'ranked by ESTIMATED ARTICLE backlog' : 'biggest untapped backlog first'}; yield >= gate):`);
      for (const h of hosts) {
        const dens = h.articlePct !== undefined ? `  article=${Math.round(h.articlePct * 100)}%  est-articles=${h.estArticleFrontier}` : '';
        console.log(`  ${h.host.padEnd(28)} frontier=${h.frontier}  proven=${h.proven}  yield=${Math.round(h.yield * 100)}%${dens}`);
      }
      console.log('\nhosts: ' + hosts.map((h) => h.host).join(','));
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
