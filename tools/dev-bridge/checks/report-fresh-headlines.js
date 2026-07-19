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
let shown = 0;
for (const r of rows) {
  const headline = extractHeadline(r.blob ? String(inflate(r.blob, r.alg)) : null);
  const label = headline || '(no stored content / no title)';
  if (seen.has(label) && headline) continue; // collapse duplicate headlines (listing pages etc.)
  seen.add(label);
  shown++;
  console.log(`  • [${r.fetched} UTC] ${label}`);
  console.log(`      ${r.url.slice(0, 110)}`);
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
