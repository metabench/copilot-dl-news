#!/usr/bin/env node
'use strict';

/**
 * run-crawl-console.js — copilot-dl-news RUNS the Crawl Console from the
 * news-crawler-ui sibling (TECH-CRAWLCONSOLE, cycle 169; first real consumer
 * of the repo founded in cycle 168).
 *
 * The split of responsibilities is the owner's 2026-08-03 architecture ruling:
 *   - news-crawler-ui owns the PAGE (controls + pure view-model);
 *   - THIS file — the composition root — owns every read: news.db opened
 *     READ-ONLY (live-DB writes stay owner-gated and single-writer), the
 *     article/section verdict via ArticleSignalsService, host policies from
 *     domain_fetch_policies. The UI module has no database code at all.
 *
 *   node tools/ui/run-crawl-console.js                     # live news.db, read-only, :3186
 *   node tools/ui/run-crawl-console.js --db <path>         # e.g. a scratch crawl DB
 *   node tools/ui/run-crawl-console.js --port 3187
 *
 * Query discipline: newest-N by PK (id DESC) then filter in JS — the frontier
 * tools' trick — so nothing scans 1.85M rows with datetime() per row. Bounded
 * COUNTs via `SELECT COUNT(*) FROM (SELECT 1 FROM t LIMIT cap)` so a huge
 * table can never pin the process.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DB_PATH = path.resolve(ROOT, getArg('--db', 'data/news.db'));
const PORT = Number(getArg('--port', 3186));
const SLICE = Math.max(500, Math.min(20000, Number(getArg('--slice', 4000))));

// Consumed as a sibling module (declared in package.json as file:../news-crawler-ui;
// resolved by path so the runner also works before an npm install has linked it).
const { startConsoleServer } = require(path.resolve(ROOT, '..', 'news-crawler-ui', 'console', 'server.js'));
const { ArticleSignalsService } = require('news-crawler-itself/signals');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

if (!fs.existsSync(DB_PATH)) {
  console.error(`no database at ${DB_PATH}`);
  process.exit(3);
}
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const boundedCount = (table, cap = 100000) => {
  try {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${table} LIMIT ${cap + 1})`).get();
    return { n: Math.min(n, cap), capped: n > cap };
  } catch (_) { return null; }
};

// Schema-tolerant prepares: this runner meets DBs of different vintages (the
// live news.db has accreted columns like urls.title; a fresh crawler-created
// scratch DB has not). A missing column degrades that panel to its honest
// empty state — it never kills the console.
const safePrep = (sql) => { try { return db.prepare(sql); } catch (_) { return null; } };
const stmts = {
  fetchEvents: safePrep(`
    SELECT hr.fetched_at, hr.http_status, u.host
    FROM http_responses hr JOIN urls u ON u.id = hr.url_id
    ORDER BY hr.id DESC LIMIT ?`)
    || safePrep(`SELECT fetched_at, http_status, host FROM fetches ORDER BY id DESC LIMIT ?`)
    || safePrep(`SELECT fetched_at, http_status, NULL AS host FROM http_responses ORDER BY id DESC LIMIT ?`),
  headlineRows: safePrep(`
    SELECT url, host, title, fetched_at, word_count
    FROM urls
    WHERE title IS NOT NULL AND title <> '' AND url LIKE 'http%'
    ORDER BY id DESC LIMIT 300`)
};

// Stored titles carry raw HTML entities (&#x27; &amp; …). Decoding is DATA
// hygiene, so it lives here at the composition root — the UI module renders
// what it is given through structural escaping and never post-processes.
// (Same decoder report-fresh-headlines proved on this corpus.)
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function readPolicies() {
  try {
    return db.prepare('SELECT host, protection_kind, fetch_strategy FROM domain_fetch_policies LIMIT 50').all();
  } catch (_) { return []; }  // scratch DBs may not carry the table
}

// ── crawl-API health, cached (drives the launcher's enable state AND
// liveness's claimsRunning) ─────────────────────────────────────────────────
// Checked in the background every 30s, never per request: getRaw() must stay
// synchronous and fast. `claimsRunning` is true/false ONLY when a jobs API
// actually answered — a dead API yields null, and the model treats null as
// "no claim", so STALLED can never fire on a guess (the liveness rule).
const API_BASES = ['http://127.0.0.1:3170', 'http://127.0.0.1:3000'];
const apiCache = { reachable: false, bases: API_BASES.map((b) => ({ base: b, ok: false })), claimsRunning: null, jobs: [] };

function probeApiOnce() {
  let pending = API_BASES.length;
  const bases = [];
  let claims = null;
  for (const base of API_BASES) {
    const req = http.get(`${base}/api/v1/crawl/jobs`, { timeout: 1200 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; if (body.length > 262144) req.destroy(); });
      res.on('end', () => {
        bases.push({ base, ok: true });
        try {
          const j = JSON.parse(body);
          const jobs = Array.isArray(j) ? j : (j.jobs || j.items || []);
          if (Array.isArray(jobs)) {
            claims = jobs.some((x) => /running|active/i.test(String(x.status || x.state || '')));
            apiCache.jobs = jobs.slice(0, 4).map((x) => ({
              id: String(x.id || '').slice(0, 8),
              status: String(x.status || x.state || '?'),
              startUrl: String(x.startUrl || ''),
              downloaded: x.progress ? x.progress.downloaded : null,
              queued: x.progress ? x.progress.queued : null,
              errors: x.progress ? x.progress.errors : null
            }));
          }
        } catch (_) { /* answered but not a jobs shape — reachable, no claim */ }
        if (--pending === 0) finish();
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => { bases.push({ base, ok: false }); if (--pending === 0) finish(); });
  }
  function finish() {
    apiCache.bases = bases;
    apiCache.reachable = bases.some((b) => b.ok);
    apiCache.claimsRunning = apiCache.reachable ? claims : null;
  }
}
probeApiOnce();
setInterval(probeApiOnce, 30000).unref();

// Launch profiles are the composition root's config, passed down as data.
const { PROFILES } = require(path.join(ROOT, 'src', 'core', 'crawler', 'config', 'defaultCrawlProfiles.js'));
const profileList = Object.values(PROFILES).map((p) => ({ name: p.name, description: p.description, overrides: p.overrides }));

function getRaw() {
  const fetchEvents = stmts.fetchEvents ? stmts.fetchEvents.all(SLICE) : [];
  const headlineRows = (stmts.headlineRows ? stmts.headlineRows.all() : []).map((r) => ({
    ...r,
    title: decodeEntities(r.title),
    articleShaped: ArticleSignalsService.isArticleShapedUrl(r.url)
  }));
  return {
    now: new Date().toISOString(),
    dbLabel: `${path.relative(ROOT, DB_PATH) || DB_PATH} (read-only)`,
    sliceLimit: SLICE,
    fetchEvents,
    headlineRows,
    policies: readPolicies(),
    storedCount: boundedCount('content_storage'),
    queueCount: boundedCount('crawl_queue'),
    profiles: profileList,
    apiStatus: { reachable: apiCache.reachable, bases: apiCache.bases, jobs: apiCache.jobs },
    politeness: {
      // 3 is the owner-gated ceiling the ritual-compliance probe enforces
      // (tools/dev/checks/ritual-compliance.check.js, check B1) — displayed
      // from the same constant family, never configurable from the console.
      concurrencyCeiling: 3,
      gateSource: 'owner directive · enforced by the ritual-compliance probe'
    },
    claimsRunning: apiCache.claimsRunning  // true/false only when a jobs API answered; else null
  };
}

// ── the ONE write-path action, supervised (owner permission 2026-08-04) ─────
// The console POSTs {profile, startUrl} to its own origin; THIS function — the
// composition root — forwards to the unified app's v1 API. The crawl API being
// down surfaces as a clean error, never a hung button. Overrides come from the
// SAME profile table the CLI uses, so console-started crawls obey the same
// politeness/concurrency defaults (safe: concurrency 3, ≤ the owner gate).
function startCrawl({ profile, startUrl } = {}) {
  return new Promise((resolve, reject) => {
    const base = (apiCache.bases || []).find((b) => b.ok);
    if (!base) { reject(new Error('crawl API not reachable — start the unified app first')); return; }
    const prof = PROFILES[profile] || PROFILES.safe;
    const payload = JSON.stringify({ startUrl: String(startUrl || '').trim() || undefined, overrides: prof.overrides });
    const req = http.request(`${base.base}/api/v1/crawl/operations/basicArticleCrawl/start`, {
      method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; if (body.length > 262144) req.destroy(); });
      res.on('end', () => {
        let parsed; try { parsed = JSON.parse(body); } catch (_) { parsed = { raw: body.slice(0, 200) }; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`crawl API HTTP ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 180)}`));
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('crawl API timeout')); });
    req.on('error', (e) => reject(e));
    req.end(payload);
  });
}

startConsoleServer({ port: PORT, getRaw, label: 'crawl-console', actions: { startCrawl } })
  .then(() => console.log(`[crawl-console] serving ${path.basename(DB_PATH)} read-only · startCrawl wired to the v1 API`))
  .catch((err) => { console.error('[crawl-console] failed to start:', err.message); process.exit(1); });
