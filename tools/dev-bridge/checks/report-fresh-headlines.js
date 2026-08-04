#!/usr/bin/env node
'use strict';

/**
 * report-fresh-headlines.js — list the news headlines actually downloaded.
 *
 * Read-only over data/news.db (safe alongside the running app). Finds
 * http_responses fetched in the window, joins their stored content, inflates
 * the blob per its recorded compression algorithm, and extracts the headline
 * (og:title meta first, then <title>). Also prints a compact historical-archive
 * summary (per-host totals + fetch-time coverage) so each report gives both
 * "what just arrived" and "what the archive now holds".
 *
 * Usage:
 *   node tools/dev-bridge/checks/report-fresh-headlines.js [--minutes 60]
 *     [--host theguardian.com] [--limit 40] [--no-archive]
 */

const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const MINUTES = Number(getArg('--minutes', 60));
const HOST = getArg('--host', null);
const LIMIT = Number(getArg('--limit', 40));
const SHOW_ARCHIVE = !argv.includes('--no-archive');
const HUB_LINKS = argv.includes('--hub-links'); // list story headlines hub pages link to

const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: true, fileMustExist: true });

function inflate(blob, algorithm) {
  if (!blob) return null;
  try {
    if (!algorithm || algorithm === 'none') return blob;
    if (algorithm === 'gzip') return zlib.gunzipSync(blob);
    if (algorithm === 'brotli' || algorithm === 'br') return zlib.brotliDecompressSync(blob);
    if (algorithm === 'deflate') return zlib.inflateSync(blob);
    return blob; // unknown algorithm: try as-is
  } catch (_) {
    // Blob may be stored raw despite metadata (or vice versa) — try the other way.
    try { return zlib.gunzipSync(blob); } catch (_) { return blob; }
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function extractHeadline(html) {
  if (!html) return null;
  const head = html.slice(0, 200000);
  const og = head.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,300})["']/i)
    || head.match(/<meta[^>]+content=["']([^"']{3,300})["'][^>]+property=["']og:title["']/i);
  if (og) return decodeEntities(og[1]);
  const t = head.match(/<title[^>]*>([\s\S]{3,300}?)<\/title>/i);
  return t ? decodeEntities(t[1]) : null;
}

// FIX 18: a section/utility page's <title>/og:title is just the section/nav name
// ("Opinion", "Sport", "About Us", "Privacy Settings", a tagline), not a story
// headline — it clutters the "what just arrived" list. A LENGTH GATE protects
// real headlines that merely start with a section word ("Business leaders warn…"
// is long, kept), so only a SHORT title matching the section/utility vocabulary
// (or a known boilerplate phrase) is routed to a collapsed summary line instead.
// The most reliable signal is the URL SHAPE, not the title text: a section/author/
// utility page has a shallow or trailing-slash path (/sports/, /author/sal-christ,
// /purpose/), whereas an article ends in a substantial slug (long id/hash, 6+ digit
// id, date path, or a many-word hyphenated slug).
//
// cycle 167: this was an INLINE COPY justified as "kept inline so this read-only
// tool stays dependency-free", and its comment claimed it mirrored
// ArticleSignalsService.isArticleShapedUrl. Measured, it did not: the copy predated
// every cycle-75 fix (trailing-slash strip, media/hub segment vetoes, CMS
// /articles/<id>, live-blog fragment reject) and cycle 167's depth-1 gate, so the
// report was hiding real headlines the crawler's own predicate admits. The
// dependency argument does not survive contact either — this file already requires
// better-sqlite3, while ArticleSignalsService pulls in exactly one dependency-free
// sibling module. One predicate, one place, so the two cannot drift again.
const { ArticleSignalsService } = require('news-crawler-itself/signals');
const isArticleShapedUrl = (url) => ArticleSignalsService.isArticleShapedUrl(url);
const SECTION_UTILITY = /^(opinion|sports?|business|politics|video(s)?|quiz(zes)?|about( us)?|privacy( settings)?|data|life( ?& ?style)?|culture|entertainment|society|education|books|premium|elections?|sci-?tech|home|news|my ?account|newsletters?|subscribe|weather|podcasts?|photos?|live|standards editor|columnist|contributors?|authors?)\b/i;
// A row is noise if its URL is not article-shaped (the primary signal), OR the
// title is a short section word / known boilerplate (catches junk titles on
// otherwise article-shaped URLs).
function isSectionOrUtility(url, title) {
  if (url && !isArticleShapedUrl(url)) return true;
  const t = (title || '').trim();
  if (t.length <= 30 && SECTION_UTILITY.test(t)) return true;
  if (/accurate news.?is essential|digital advertisement registry|stay connected with|welcome to|website accessibility|al jazeera live/i.test(t)) return true;
  return false;
}

// --hub-links: hub/section pages carry the REAL story of the crawl — the
// article headlines they link to — but their own <title> is just the section
// name. Extract linked-story titles from full page HTML. Two passes, union:
// (a) aria-label on story links (Guardian and other accessibility-labelled
// fronts put the full headline there); (b) anchor text on article-shaped
// paths (/news/, /article, dated paths etc.), which covers Al Jazeera, DW,
// The Hindu and most others. Noise-gated: min length, no nav/CTA verbs.
function extractHubStoryTitles(html, cap = 6) {
  if (!html) return [];
  const NOISE = /^(View|More|All|Sign|Log|Search|Menu|Subscribe|Newsletter|Listen|Watch live|Live\b|Home|About|Contact)/i;
  const titles = [];
  const push = (raw) => {
    const t = decodeEntities(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 35 || t.length > 160 || NOISE.test(t)) return;
    if (!titles.includes(t)) titles.push(t);
  };
  for (const m of html.matchAll(/aria-label="([^"]{35,200})"/gi)) push(m[1]);
  for (const m of html.matchAll(/<a [^>]*href="[^"]*(?:\/news\/|\/article|\/story\/|\/\d{4}\/\d{1,2}\/)[^"]*"[^>]*>([\s\S]{35,300}?)<\/a>/gi)) push(m[1]);
  return titles.slice(0, cap);
}

// ---- Fresh downloads in the window ----------------------------------------
// fetched_at is stored in MIXED formats (ISO T…Z + space) — normalize via datetime().
const hostFilter = HOST ? "AND u.host LIKE '%' || ? || '%'" : '';
const rows = db.prepare(`
  SELECT u.host, u.url, datetime(hr.fetched_at) AS fetched, hr.http_status,
         hr.bytes_downloaded, cs.content_blob AS blob, ct.algorithm AS alg,
         cs.uncompressed_size, cs.compressed_size
  FROM http_responses hr
  JOIN urls u ON u.id = hr.url_id
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
  LEFT JOIN compression_types ct ON ct.id = cs.compression_type_id
  WHERE datetime(hr.fetched_at) > datetime('now', ?)
    ${hostFilter}
  ORDER BY datetime(hr.fetched_at) DESC
  LIMIT ?
`).all(`-${MINUTES} minutes`, ...(HOST ? [HOST] : []), LIMIT);

console.log(`\n== Fresh downloads (last ${MINUTES} min${HOST ? ', host~' + HOST : ''}) — ${rows.length} row(s) ==`);
const seen = new Set();
const sectionTitles = new Set(); // FIX 18: section/utility "headlines" collapsed below
let shown = 0;
for (const r of rows) {
  const html = r.blob ? String(inflate(r.blob, r.alg)) : null;
  const headline = extractHeadline(html);
  const label = headline || '(no stored content / no title)';
  if (seen.has(label) && headline) continue; // collapse duplicate headlines (listing pages etc.)
  seen.add(label);
  if (isSectionOrUtility(r.url, headline)) { sectionTitles.add(headline || r.url.replace(/^https?:\/\//, '')); continue; } // FIX 18
  shown++;
  console.log(`  • [${r.fetched} UTC] ${label}`);
  console.log(`      ${r.url.slice(0, 110)}`);
  if (HUB_LINKS && html) {
    for (const story of extractHubStoryTitles(html)) console.log(`        › ${story}`);
  }
}
if (sectionTitles.size) {
  console.log(`  (+ ${sectionTitles.size} section/utility page(s) hidden: ${[...sectionTitles].slice(0, 12).join(', ')})`);
}
if (!rows.length) console.log('  (none — crawler idle in this window)');

// ---- Historical archive summary -------------------------------------------
if (SHOW_ARCHIVE) {
  console.log('\n== Historical archive (stored articles by host, top 12) ==');
  const hosts = db.prepare(`
    SELECT u.host, COUNT(*) AS pages,
           SUM(CASE WHEN cs.id IS NOT NULL THEN 1 ELSE 0 END) AS docs,
           MIN(datetime(hr.fetched_at)) AS first_fetch,
           MAX(datetime(hr.fetched_at)) AS last_fetch
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    GROUP BY u.host ORDER BY pages DESC LIMIT 12
  `).all();
  for (const h of hosts) {
    console.log(`  ${String(h.host || '(none)').padEnd(28)} pages=${String(h.pages).padStart(6)}  docs=${String(h.docs).padStart(6)}  ${h.first_fetch} -> ${h.last_fetch}`);
  }
  const an = db.prepare(`SELECT COUNT(*) c FROM content_analysis WHERE classification='article' AND title IS NOT NULL`).get().c;
  console.log(`\n  Analyzed article headlines in archive: ${an.toLocaleString('en-US')}`);
}

db.close();
