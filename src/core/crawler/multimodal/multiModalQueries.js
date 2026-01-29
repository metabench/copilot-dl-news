"use strict";

/**
 * Resolve multi-modal crawl query helpers from a db handle.
 * Supports NewsDatabase wrappers and raw better-sqlite3 handles.
 */
function resolveMultiModalQueries(db) {
  if (!db) return null;

  if (typeof db.createMultiModalCrawlQueries === "function") {
    return db.createMultiModalCrawlQueries();
  }

  const raw = db.db && typeof db.db.prepare === "function" ? db.db : db;
  if (raw && typeof raw.prepare === "function") {
    const { createMultiModalCrawlQueries } = require('../../../data/db/sqlite/v1/queries/multiModalCrawl");
    return createMultiModalCrawlQueries(raw);
  }

  return null;
}

module.exports = { resolveMultiModalQueries };
