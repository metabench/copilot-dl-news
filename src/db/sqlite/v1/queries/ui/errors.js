"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.errors");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    listRecent: (() => {
      try {
        return handle.prepare(`
          SELECT url, host, kind, code, message, details, at
          FROM errors
          WHERE at IS NOT NULL
          ORDER BY at DESC
          LIMIT ?
        `);
      } catch (_) {
        // Older snapshots may not have url, use a safer projection
        return handle.prepare(`
          SELECT host, kind, code, message, details, at
          FROM errors
          WHERE at IS NOT NULL
          ORDER BY at DESC
          LIMIT ?
        `);
      }
    })()
    ,dailyHostHistogram: handle.prepare(`
      SELECT DATE(at) AS day,
             LOWER(COALESCE(host, '')) AS host,
             COUNT(*) AS total
      FROM errors
      WHERE at >= datetime('now', ?)
      GROUP BY day, host
      ORDER BY day DESC, total DESC
      LIMIT ?
    `)
  }));
}

function listRecentErrors(db, options = {}) {
  const { listRecent } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { fallback: 200 });
  return listRecent.all(safeLimit);
}

function dailyHostHistogram(db, options = {}) {
  const { dailyHostHistogram: hist } = prepareStatements(db);
  const days = Number.isFinite(Number(options.days)) ? Number(options.days) : 7;
  const safeLimit = sanitizeLimit(options.limit, { fallback: 200 });
  return hist.all(`-${days} days`, safeLimit);
}

module.exports = {
  listRecentErrors,
  dailyHostHistogram
};
