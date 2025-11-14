"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.storage");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    totals: handle.prepare(`
      SELECT
        COUNT(*) AS objectCount,
        COALESCE(SUM(uncompressed_size), 0) AS uncompressedBytes,
        COALESCE(SUM(compressed_size), 0) AS compressedBytes
      FROM content_storage
    `)
  }));
}

function getStorageTotals(db) {
  const { totals } = prepareStatements(db);
  return totals.get() || { objectCount: 0, uncompressedBytes: 0, compressedBytes: 0 };
}

module.exports = {
  getStorageTotals
};
