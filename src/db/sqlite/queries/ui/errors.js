"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.errors");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    listRecent: handle.prepare(`
      SELECT url, host, kind, code, message, details, at
      FROM errors
      WHERE at IS NOT NULL
      ORDER BY at DESC
      LIMIT ?
    `)
  }));
}

function listRecentErrors(db, options = {}) {
  const { listRecent } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { fallback: 200 });
  return listRecent.all(safeLimit);
}

module.exports = {
  listRecentErrors
};
