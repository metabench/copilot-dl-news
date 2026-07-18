/**
 * SQLite Database Ensure Module
 *
 * Compatibility bridge (B10c): the v1 implementation retired into
 * news-crawler-db + src/db/ensureNewsDb.js.
 */

const { ensureDb } = require('../../../db/ensureNewsDb');

module.exports = {
  ensureDb
};
