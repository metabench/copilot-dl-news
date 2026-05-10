'use strict';

/**
 * Compatibility wrapper for team workspace, member, shared-feed, annotation,
 * and activity DB access.
 *
 * SQL and schema ownership live in news-crawler-db. This file preserves the
 * historical CommonJS exports used by copilot-dl-news team services.
 */

const {
  createSqliteWorkspaceAdapter,
  ensureSqliteWorkspaceSchema,
  generateSqliteWorkspaceSlug,
  ROLES,
  ROLE_HIERARCHY,
  ANNOTATION_TYPES,
  ACTIVITY_ACTIONS
} = require('news-crawler-db');

function createWorkspaceAdapter(db) {
  return createSqliteWorkspaceAdapter(db);
}

function ensureWorkspaceSchema(db) {
  return ensureSqliteWorkspaceSchema(db);
}

module.exports = {
  createWorkspaceAdapter,
  ensureWorkspaceSchema,
  generateSlug: generateSqliteWorkspaceSlug,
  ROLES,
  ROLE_HIERARCHY,
  ANNOTATION_TYPES,
  ACTIVITY_ACTIONS
};
