'use strict';

/**
 * Compatibility wrapper for user account, session, preference, and feed DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS export names used by copilot-dl-news services.
 */

const {
  createSqliteUserAdapter,
  ensureSqliteUserSchema,
  hashSqliteUserPassword,
  verifySqliteUserPassword,
  generateSqliteUserSessionToken
} = require('news-crawler-db');

function createUserAdapter(db) {
  return createSqliteUserAdapter(db);
}

function ensureUserSchema(db) {
  return ensureSqliteUserSchema(db);
}

module.exports = {
  createUserAdapter,
  ensureUserSchema,
  hashPassword: hashSqliteUserPassword,
  verifyPassword: verifySqliteUserPassword,
  generateSessionToken: generateSqliteUserSessionToken
};
