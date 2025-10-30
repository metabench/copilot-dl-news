#!/usr/bin/env node

// Backfill publication dates for existing articles by parsing stored HTML.
// Memory-safe strategy:
// - Stream rows from SQLite instead of loading all into memory.
// - For rows that already have a date, don't fetch HTML at all.
// - Try a lightweight HTML scan first; fall back to JSDOM only if needed.
// - Ensure any JSDOM windows are explicitly closed to free memory.

const path = require('path');
const { createJsdom } = require('../utils/jsdomUtils');

// Gracefully handle broken pipe (e.g., piping to `Select-Object -First N`)
try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

// Lightweight extraction: scan HTML for common meta/time tags without building a DOM
function quickExtractDate(html) {
  if (!html) return null;
  try {
    const s = String(html);

    // Utility to parse attributes from a single tag string
    const parseAttrs = (tag) => {
      const attrs = {};
      // Handles key="value" or key='value' and keys with : or - (e.g., og:updated_time)
      const re = /(\w[\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let m;
      while ((m = re.exec(tag)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[3] !== undefined ? m[3] : m[4] || '';
        attrs[key] = val;
      }
      return attrs;
    };

    // 1) <meta ... content="...">
    const metaRe = /<meta\b[^>]*>/gi;
    const wantedMeta = new Set([
      'article:published_time',
      'datepublished',
      'og:updated_time',
      'date'
    ]);
    let m;
    while ((m = metaRe.exec(s)) !== null) {
      const tag = m[0];
      const a = parseAttrs(tag);
      const key = (a.property || a.name || a.itemprop || '').toLowerCase();
      if (!key) continue;
      if (wantedMeta.has(key)) {
        const v = a.content || '';
        const iso = toIso(v);
        if (iso) return iso;
      }
    }

    // 2) <time datetime="...">
    const timeRe = /<time\b[^>]*>/gi;
    while ((m = timeRe.exec(s)) !== null) {
      const tag = m[0];
      const a = parseAttrs(tag);
      const v = a.datetime || '';
      const iso = toIso(v);
      if (iso) return iso;
    }

    return null;
  } catch (_) {
    return null;
  }
}

function extractDate(html) {
  // Try lightweight path first
  const quick = quickExtractDate(html);
  if (quick) return quick;

  // Fall back to JSDOM when necessary
  try {
    let dom = null;
    try {
      ({ dom } = createJsdom(html || '', {
        jsdomOptions: { runScripts: 'outside-only' }
      }));
      const doc = dom.window.document;
    const pick = (sel, attr) => {
      const el = doc.querySelector(sel);
      if (!el) return null;
      return attr ? (el.getAttribute(attr) || null) : (el.textContent || '').trim();
    };
    const candidates = [
      ['meta[property="article:published_time"]', 'content'],
      ['meta[name="article:published_time"]', 'content'],
      ['meta[name="pubdate"]', 'content'],
      ['time[datetime]', 'datetime'],
      ['[itemprop="datePublished"]', 'content'],
      ['meta[property="og:updated_time"]', 'content'],
      ['meta[name="date"]', 'content'],
      // Class-based fallbacks (DOM only)
      ['.date', null],
      ['.published', null],
      ['.timestamp', null]
    ];
      for (const [sel, attr] of candidates) {
        const v = pick(sel, attr);
        if (!v) continue;
        const iso = toIso(v);
        if (iso) {
          dom.window.close();
          dom = null;
          return iso;
        }
      }
    } finally {
      if (dom) {
        dom.window.close();
      }
    }
  } catch (_) {}
  return null;
}

function toIso(v) {
  if (!v) return null;
  const s = String(v).trim();
  // If it's already ISO
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return new Date(d).toISOString();
  return null;
}

function main() {
  const dbPathArg = process.argv.find(a => a.startsWith('--db='));
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const batchArg = process.argv.find(a => a.startsWith('--batch-size='));
  const noListExisting = process.argv.includes('--no-list-existing');
  const redo = process.argv.includes('--redo') || process.argv.includes('--force');
  const includeNav = process.argv.includes('--include-nav');
  const onlyArticles = includeNav ? false : true; // default: only article pages
  const urlArg = process.argv.find(a => a.startsWith('--url='));
  const onlyUrl = urlArg ? urlArg.split('=')[1] : '';
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : path.join(process.cwd(), 'data', 'news.db');
  const LIMIT = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0; // 0 = no limit
  const BATCH_SIZE_CLI = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10) || 50) : 50;
  let NewsDatabase;
  try { NewsDatabase = require('../db'); } catch (e) {
    console.error('Database unavailable:', e.message);
    process.exit(1);
  }
  const db = new NewsDatabase(dbPath);
  // Print rows that already have dates (no HTML read)
  if (!noListExisting && !redo) {
    // List existing dates for the selected scope (articles by default)
    const baseWhere = [ 'a.date IS NOT NULL' ];
    const params = [];
    if (onlyArticles) {
      baseWhere.push("EXISTS (SELECT 1 FROM fetches f WHERE f.url = a.url AND f.classification = 'article')");
    }
    if (onlyUrl) {
      baseWhere.push('a.url = ?');
      params.push(onlyUrl);
    }
    const rows = db.db.prepare(`SELECT a.url, a.date FROM articles a WHERE ${baseWhere.join(' AND ')}`).iterate(...params);
    for (const r of rows) {
      const existing = (r.date || '').trim();
      process.stdout.write(`existing\t${existing}\t${r.url}\n`);
    }
  }

  // Process rows missing dates; stream to keep memory stable
  const updateStmt = db.db.prepare('UPDATE articles SET date = ? WHERE url = ?');
  // Batch processor transaction
  const tx = db.db.transaction((items) => {
    for (const r of items) {
      const iso = extractDate(r.html || '');
      if (iso) {
        updateStmt.run(iso, r.url);
        process.stdout.write(`backfilled\t${iso}\t${r.url}\n`);
      } else {
        process.stdout.write(`missing\t\t${r.url}\n`);
      }
    }
  });

  // Paginate over rows missing dates to avoid holding a cursor during updates
  const PAGE = Math.max(1, BATCH_SIZE_CLI);
  let lastId = 0;
  let processed = 0;
  while (true) {
    let toFetch = PAGE;
    if (LIMIT) {
      const remaining = LIMIT - processed;
      if (remaining <= 0) break;
      toFetch = Math.min(toFetch, remaining);
    }
    // Build base WHERE: scope by only-articles and optional single URL
    const where = [ 'a.id > ?' ];
    const params = [ lastId ];
    if (!redo) {
      where.push('a.date IS NULL');
    }
    if (onlyArticles) {
      where.push("EXISTS (SELECT 1 FROM fetches f WHERE f.url = a.url AND f.classification = 'article')");
    }
    if (onlyUrl) {
      where.push('a.url = ?');
      params.push(onlyUrl);
    }
    params.push(toFetch);
    const rows = db.db
      .prepare(`SELECT a.id, a.url, a.html, a.date FROM articles a WHERE ${where.join(' AND ')} ORDER BY a.id LIMIT ?`)
      .all(...params);
    if (!rows.length) break;
    // Process rows with redo-aware logic
    if (redo) {
      const missingRows = rows.filter(r => !r.date);
      if (missingRows.length) tx(missingRows.map(r => ({ id: r.id, url: r.url, html: r.html })));
      // Emit redo-specific statuses for rows that already had a date
      for (const r of rows) {
        const existing = (r.date || '').trim();
        if (!existing) continue; // handled above as missing
        const iso = extractDate(r.html || '');
        if (iso && iso !== existing) {
          updateStmt.run(iso, r.url);
          process.stdout.write(`updated\t${iso}\t${r.url}\n`);
        } else {
          process.stdout.write(`unchanged\t${existing}\t${r.url}\n`);
        }
      }
    } else {
      // Normal mode: only missing-date rows are selected, send to tx
      tx(rows.map(r => ({ id: r.id, url: r.url, html: r.html })));
    }
    processed += rows.length;
    lastId = rows[rows.length - 1].id;
  }

  db.close();
}

if (require.main === module) main();
