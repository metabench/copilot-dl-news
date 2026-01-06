'use strict';

const { createJsdom } = require('../utils/jsdomUtils');
const { ensureDb } = require('../db/sqlite');
const { createBackfillDatesQueries } = require('../db/sqlite/v1/queries/articles.backfillDates');

function toIso(value) {
  if (!value) return null;
  const s = String(value).trim();
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return new Date(d).toISOString();
  return null;
}

// Lightweight extraction: scan HTML for common meta/time tags without building a DOM
function quickExtractDate(html) {
  if (!html) return null;
  try {
    const s = String(html);

    const parseAttrs = (tag) => {
      const attrs = {};
      const re = /(\w[\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let m;
      while ((m = re.exec(tag)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[3] !== undefined ? m[3] : m[4] || '';
        attrs[key] = val;
      }
      return attrs;
    };

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
      const attrs = parseAttrs(tag);
      const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
      if (!key) continue;
      if (wantedMeta.has(key)) {
        const iso = toIso(attrs.content || '');
        if (iso) return iso;
      }
    }

    const timeRe = /<time\b[^>]*>/gi;
    while ((m = timeRe.exec(s)) !== null) {
      const tag = m[0];
      const attrs = parseAttrs(tag);
      const iso = toIso(attrs.datetime || '');
      if (iso) return iso;
    }

    return null;
  } catch (_) {
    return null;
  }
}

function extractDate(html) {
  const quick = quickExtractDate(html);
  if (quick) return quick;

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
      if (dom) dom.window.close();
    }
  } catch (_) {
    // ignore
  }

  return null;
}

function computePercent(current, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

/**
 * Backfill publication dates for existing articles by parsing stored HTML.
 *
 * @param {object} options
 * @param {import('better-sqlite3').Database} [options.db] - Optional database handle.
 * @param {string} [options.dbPath] - Used when db is not supplied.
 * @param {number} [options.limit=0] - Max rows to process (0=unlimited).
 * @param {number} [options.batchSize=50]
 * @param {boolean} [options.listExisting=true]
 * @param {boolean} [options.redo=false]
 * @param {boolean} [options.includeNav=false]
 * @param {string} [options.onlyUrl='']
 * @param {number} [options.startAfterId=0] - Resume cursor: process rows with id > startAfterId.
 * @param {AbortSignal} [options.signal]
 * @param {() => Promise<void>} [options.awaitIfPaused]
 * @param {(progress: {current:number,total:number,percent:number,message:string,metadata?:object}) => void} [options.onProgress]
 * @param {(evt: {type:string,date?:string,url?:string}) => void} [options.onRowEvent]
 * @param {{log?:Function,warn?:Function,error?:Function}} [options.logger]
 */
async function backfillDates(options = {}) {
  const {
    db: externalDb,
    dbPath = 'data/news.db',
    limit = 0,
    batchSize = 50,
    listExisting = true,
    redo = false,
    includeNav = false,
    onlyUrl = '',
    startAfterId = 0,
    signal,
    awaitIfPaused,
    onProgress,
    onRowEvent,
    logger
  } = options;

  const log = logger?.log || (() => {});
  const warn = logger?.warn || (() => {});

  const shouldStop = () => Boolean(signal && signal.aborted);

  const maybePause = async () => {
    if (typeof awaitIfPaused !== 'function') return;
    await awaitIfPaused();
  };

  const safeProgress = (progress) => {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress(progress);
    } catch (_) {
      // ignore
    }
  };

  const safeEvent = (evt) => {
    if (typeof onRowEvent !== 'function') return;
    try {
      onRowEvent(evt);
    } catch (_) {
      // ignore
    }
  };

  let db = externalDb;
  let shouldCloseDb = false;

  try {
    if (!db) {
      db = ensureDb(dbPath);
      shouldCloseDb = true;
    }

    const queries = createBackfillDatesQueries(db);
    const onlyArticles = includeNav ? false : true;

    // Determine total work upfront (for better progress bars)
    let totalCandidates = 0;
    try {
      totalCandidates = queries.countCandidates({
        onlyArticles,
        onlyUrl,
        includeExistingDates: redo,
        startAfterId
      });
    } catch (err) {
      warn(`[backfill-dates] Could not count candidates: ${err?.message || err}`);
      totalCandidates = 0;
    }

    if (limit && totalCandidates) {
      totalCandidates = Math.min(totalCandidates, limit);
    }

    const stats = {
      processed: 0,
      batches: 0,
      backfilled: 0,
      updated: 0,
      unchanged: 0,
      missing: 0,
      existingListed: 0
    };

    const report = (message, metadata) => {
      safeProgress({
        current: stats.processed,
        total: totalCandidates,
        percent: computePercent(stats.processed, totalCandidates),
        message,
        metadata
      });
    };

    report('Starting date backfill', {
      stage: 'starting',
      cursor: { lastId: startAfterId },
      totalCandidates,
      redo,
      includeNav,
      onlyUrl
    });

    await maybePause();

    if (shouldStop()) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    if (listExisting && !redo) {
      report('Listing existing dates (preview)', {
        stage: 'list-existing',
        cursor: { lastId: startAfterId }
      });

      for (const row of queries.iterateExistingDates({ onlyArticles, onlyUrl })) {
        await maybePause();
        if (shouldStop()) {
          const abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        const existing = (row.date || '').trim();
        safeEvent({ type: 'existing', date: existing, url: row.url });
        stats.existingListed += 1;
      }
    }

    report('Backfilling missing dates', {
      stage: redo ? 'redo-backfill' : 'backfill',
      cursor: { lastId: startAfterId }
    });

    const txBackfillMissing = db.transaction((items) => {
      for (const row of items) {
        const iso = extractDate(row.html || '');
        if (iso) {
          queries.updateArticleDate(row.url, iso);
          safeEvent({ type: 'backfilled', date: iso, url: row.url });
          stats.backfilled += 1;
        } else {
          safeEvent({ type: 'missing', date: '', url: row.url });
          stats.missing += 1;
        }
      }
    });

    let lastId = Number.isFinite(startAfterId) ? startAfterId : 0;

    while (true) {
      await maybePause();
      if (shouldStop()) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      let toFetch = batchSize;
      if (limit) {
        const remaining = limit - stats.processed;
        if (remaining <= 0) break;
        toFetch = Math.min(toFetch, remaining);
      }

      const rows = queries.fetchBatch({
        lastId,
        limit: toFetch,
        includeExistingDates: redo,
        onlyArticles,
        onlyUrl
      });

      if (!rows.length) break;

      if (redo) {
        const missingRows = rows.filter((row) => !row.date);
        if (missingRows.length) txBackfillMissing(missingRows);

        for (const row of rows) {
          await maybePause();
          if (shouldStop()) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            throw abortErr;
          }

          if (!row.date) continue;
          const existing = (row.date || '').trim();
          const iso = extractDate(row.html || '');

          if (iso && iso !== existing) {
            queries.updateArticleDate(row.url, iso);
            safeEvent({ type: 'updated', date: iso, url: row.url });
            stats.updated += 1;
          } else {
            safeEvent({ type: 'unchanged', date: existing, url: row.url });
            stats.unchanged += 1;
          }
        }
      } else {
        txBackfillMissing(rows);
      }

      stats.processed += rows.length;
      stats.batches += 1;
      lastId = rows[rows.length - 1].id;

      if (stats.batches === 1 || stats.processed % Math.max(1, batchSize * 5) === 0) {
        report(`Backfill: ${stats.processed}/${totalCandidates || '?'} (${computePercent(stats.processed, totalCandidates)}%)`, {
          stage: redo ? 'redo-backfill' : 'backfill',
          cursor: { lastId },
          stats
        });
      }
    }

    report('Date backfill complete', {
      stage: 'completed',
      final: true,
      cursor: { lastId },
      stats,
      redo,
      includeNav,
      onlyUrl
    });

    log(`[backfill-dates] Done. processed=${stats.processed} backfilled=${stats.backfilled} updated=${stats.updated} missing=${stats.missing}`);

    return {
      ...stats,
      redo,
      includeNav,
      limit,
      limited: Boolean(limit && stats.processed >= limit),
      cursor: { lastId },
      totalCandidates
    };
  } finally {
    if (shouldCloseDb) {
      try {
        db.close();
      } catch (_) {
        // ignore
      }
    }
  }
}

module.exports = {
  backfillDates,
  extractDate,
  quickExtractDate,
  toIso
};
