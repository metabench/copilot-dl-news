#!/usr/bin/env node

// Backfill publication dates for existing articles by parsing stored HTML.
// Memory-safe strategy:
// - Stream rows from SQLite instead of loading all into memory.
// - For rows that already have a date, don't fetch HTML at all.
// - Try a lightweight HTML scan first; fall back to JSDOM only if needed.
// - Ensure any JSDOM windows are explicitly closed to free memory.

const path = require('path');
const { createJsdom } = require('../shared/utils/jsdomUtils');
const { ensureDb } = require('../data/db/sqlite');
const { CliFormatter } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');
const { createBackfillDatesQueries } = require('../data/db/sqlite/v1/queries/articles.backfillDates');
const { backfillDates } = require('./backfill-dates-core');

const fmt = new CliFormatter();

// Gracefully handle broken pipe (e.g., piping to `Select-Object -First N`)
try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'backfill-dates',
    'Backfill article publication dates from stored HTML'
  );

  parser
    .add('--db <path>', 'Path to SQLite database', 'data/news.db')
    .add('--limit <number>', 'Maximum number of rows to process (0 = unlimited)', 0, 'number')
    .add('--batch-size <number>', 'Rows per transaction batch', 50, 'number')
    .add('--no-list-existing', 'Skip listing rows that already have a date', false, 'boolean')
    .add('--redo', 'Reprocess rows even if a date already exists', false, 'boolean')
    .add('--force', 'Alias for --redo', false, 'boolean')
    .add('--include-nav', 'Include non-article pages (navigation, etc.)', false, 'boolean')
    .add('--url <value>', 'Only process a specific URL', '')
    .add('--stream <boolean>', 'Emit per-row legacy event lines (true/false)', true, 'boolean')
    .add('--quiet', 'Suppress formatted summary output (JSON only)', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii');

  return parser.parse(argv);
}

function normalizeOptions(rawArgs) {
  const dbOption = rawArgs.db || 'data/news.db';
  const dbPath = path.isAbsolute(dbOption) ? dbOption : path.join(process.cwd(), dbOption);

  const limit = Number.isFinite(rawArgs.limit) ? Math.max(0, rawArgs.limit) : 0;
  const batchSize = Number.isFinite(rawArgs.batchSize) && rawArgs.batchSize > 0 ? rawArgs.batchSize : 50;
  const listExisting = rawArgs.noListExisting ? false : true;
  const redo = Boolean(rawArgs.redo || rawArgs.force);
  const includeNav = Boolean(rawArgs.includeNav);
  const onlyUrl = typeof rawArgs.url === 'string' ? rawArgs.url.trim() : '';
  const stream = rawArgs.stream === undefined ? true : Boolean(rawArgs.stream);
  const quiet = Boolean(rawArgs.quiet);
  const summaryFormatRaw = typeof rawArgs.summaryFormat === 'string' ? rawArgs.summaryFormat.toLowerCase() : 'ascii';
  if (!['ascii', 'json'].includes(summaryFormatRaw)) {
    throw new Error(`Unsupported summary format: ${rawArgs.summaryFormat}`);
  }

  return {
    dbPath,
    limit,
    batchSize,
    listExisting,
    redo,
    includeNav,
    onlyUrl,
    stream,
    quiet,
    summaryFormat: summaryFormatRaw
  };
}

function createEventEmitter(streamEnabled) {
  const counts = Object.create(null);

  return {
    emit(type, date, url) {
      counts[type] = (counts[type] || 0) + 1;
      if (!streamEnabled) return;
      const safeDate = date ? String(date) : '';
      const safeUrl = url ? String(url) : '';
      process.stdout.write(`${type}\t${safeDate}\t${safeUrl}\n`);
    },
    counts
  };
}

function emitSummary(summary, { quiet, format }) {
  const payload = {
    processed: summary.processed,
    batches: summary.batches,
    backfilled: summary.backfilled,
    updated: summary.updated,
    unchanged: summary.unchanged,
    missing: summary.missing,
    existingListed: summary.existingListed,
    redo: summary.redo,
    includeNav: summary.includeNav,
    limited: summary.limited,
    limit: summary.limit
  };

  if (quiet || format === 'json') {
    const spacing = quiet ? undefined : 2;
    console.log(JSON.stringify(payload, null, spacing));
    return;
  }

  fmt.section('Summary');
  fmt.stat('Rows processed', summary.processed, 'number');
  fmt.stat('Batches', summary.batches, 'number');
  fmt.stat('Backfilled', summary.backfilled, 'number');
  fmt.stat('Updated', summary.updated, 'number');
  fmt.stat('Unchanged', summary.unchanged, 'number');
  fmt.stat('Missing', summary.missing, 'number');
  fmt.stat('Existing listed', summary.existingListed, 'number');
  fmt.stat('Redo mode', summary.redo ? 'enabled' : 'disabled');
  fmt.stat('Include nav pages', summary.includeNav ? 'yes' : 'no');
  if (summary.limit) {
    fmt.stat('Limit reached', summary.limited ? 'yes' : 'no');
  }
  fmt.footer();
}

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

// Note: Core implementation lives in backfill-dates-core.js; this file remains the CLI wrapper.

if (require.main === module) {
  (async () => {
    let options;
    try {
      const rawArgs = parseCliArgs(process.argv);
      options = normalizeOptions(rawArgs);
    } catch (error) {
      fmt.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }

    const {
      dbPath,
      limit,
      batchSize,
      listExisting,
      redo,
      includeNav,
      onlyUrl,
      stream,
      quiet,
      summaryFormat
    } = options;

    if (!quiet) {
      fmt.header('Backfill Publication Dates');
      fmt.section('Configuration');
      fmt.stat('Database path', dbPath);
      fmt.stat('Batch size', batchSize, 'number');
      if (limit) fmt.stat('Row limit', limit, 'number');
      if (onlyUrl) fmt.stat('Filter URL', onlyUrl);
      fmt.stat('Include nav pages', includeNav ? 'yes' : 'no');
      fmt.stat('Redo mode', redo ? 'enabled' : 'disabled');
      fmt.stat('List existing', listExisting && !redo ? 'yes' : 'no');
    }

    let dbHandle;
    try {
      dbHandle = ensureDb(dbPath);
    } catch (error) {
      fmt.error(`Failed to open database: ${error.message || error}`);
      process.exitCode = 1;
      return;
    }

    const events = createEventEmitter(stream);

    try {
      const summary = {
        ...(await backfillDates({
          db: dbHandle,
          dbPath,
          limit,
          batchSize,
          listExisting,
          redo,
          includeNav,
          onlyUrl,
          onRowEvent: (evt) => {
            events.emit(evt.type, evt.date || '', evt.url || '');
          },
          logger: quiet ? null : console
        }))
      };

      // Normalize keys for legacy summary output
      emitSummary({
        processed: summary.processed,
        batches: summary.batches,
        backfilled: summary.backfilled,
        updated: summary.updated,
        unchanged: summary.unchanged,
        missing: summary.missing,
        existingListed: summary.existingListed,
        redo: summary.redo,
        includeNav: summary.includeNav,
        limit: summary.limit,
        limited: summary.limited
      }, { quiet, format: summaryFormat });
    } catch (error) {
      fmt.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      try { dbHandle.close(); } catch (_) {}
    }
  })();
}
