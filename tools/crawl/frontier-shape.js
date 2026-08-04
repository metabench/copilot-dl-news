#!/usr/bin/env node
'use strict';

/*
 * frontier-shape.js — read-only, OFF-SERVER scout: what fraction of a host's PENDING
 * frontier URLs are article-shaped vs hub/section-shaped, judged by the SAME
 * `looksLikeArticle` the crawler uses (ArticleSignalsService), so the measurement
 * matches reality. Sizes the "frontier is hub-heavy, headlines are thin" problem
 * with DB-evidence before spending a cycle on a seeder.
 *
 * Safety (per the WAL-pin incident, [[live-db-probe-gotcha]]): read-only connection,
 * per-host queries via idx_urls_host, every scan LIMIT-bounded to a sample — never a
 * full frontier scan. Runs in its own process; NEVER on the server event loop.
 *
 *   node tools/crawl/frontier-shape.js --hosts www.bbc.com,apnews.com,www.independent.co.uk
 *   node tools/crawl/frontier-shape.js               # a default top-news-host set
 *   node tools/crawl/frontier-shape.js --sample 5000 --examples 4 --json
 */

const path = require('path');
const { createRequire } = require('module');
const REPO = path.resolve(__dirname, '..', '..');
const req = createRequire(path.join(REPO, 'package.json'));
const Database = req(require.resolve('better-sqlite3', { paths: [REPO, path.join(REPO, '..', 'news-crawler-db')] }));
const { ArticleSignalsService } = require('news-crawler-itself/signals');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}

const DEFAULT_HOSTS = ['www.bbc.com', 'apnews.com', 'www.npr.org', 'www.independent.co.uk', 'www.france24.com', 'www.irishtimes.com', 'www.abc.net.au', 'www.theguardian.com'];
const HOSTS = (arg('--hosts', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const hosts = HOSTS.length ? HOSTS : DEFAULT_HOSTS;
const SAMPLE = Math.max(100, Number(arg('--sample', 3000)));
const EXAMPLES = Math.max(0, Number(arg('--examples', 3)));
const AS_JSON = process.argv.includes('--json');
const DB_PATH = path.resolve(REPO, arg('--db', path.join('data', 'news.db')));

const signals = new ArticleSignalsService({});
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const countStmt = db.prepare("SELECT COUNT(*) AS n FROM urls WHERE host = ? AND status = 'pending'");
// LIMIT-bounded sample of pending URLs for a host (indexed on host).
const sampleStmt = db.prepare("SELECT url FROM urls WHERE host = ? AND status = 'pending' LIMIT ?");

const report = [];
for (const host of hosts) {
  let pending = 0;
  try { pending = countStmt.get(host).n; } catch (_) { pending = -1; }
  let rows = [];
  try { rows = sampleStmt.all(host, SAMPLE); } catch (_) { rows = []; }
  let article = 0;
  const artEx = [], hubEx = [];
  for (const r of rows) {
    const isArt = signals.looksLikeArticle(r.url);
    if (isArt) { article++; if (artEx.length < EXAMPLES) artEx.push(r.url); }
    else if (hubEx.length < EXAMPLES) hubEx.push(r.url);
  }
  const sampled = rows.length;
  report.push({
    host,
    pending,
    sampled,
    articlePct: sampled ? +(100 * article / sampled).toFixed(1) : null,
    estArticlePending: (sampled && pending > 0) ? Math.round(pending * article / sampled) : null,
    articleExamples: artEx,
    hubExamples: hubEx,
  });
}
db.close();

if (AS_JSON) {
  process.stdout.write(JSON.stringify({ dbPath: DB_PATH, sample: SAMPLE, report }, null, 2) + '\n');
} else {
  console.log(`frontier shape (sample<=${SAMPLE} pending/host, classified by looksLikeArticle)`);
  console.log('  pending   sample   article%   ~est-article-pending   host');
  for (const r of report) {
    console.log(`  ${String(r.pending).padStart(7)}   ${String(r.sampled).padStart(6)}   ${String(r.articlePct ?? 'n/a').padStart(7)}%   ${String(r.estArticlePending ?? 'n/a').padStart(19)}   ${r.host}`);
  }
  console.log('\n  examples (first host with data):');
  const ex = report.find((r) => r.sampled > 0);
  if (ex) {
    console.log('    ARTICLE-shaped:', ex.articleExamples.join('  ') || '(none in sample)');
    console.log('    HUB-shaped:    ', ex.hubExamples.join('  ') || '(none in sample)');
  }
}
