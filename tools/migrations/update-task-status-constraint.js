#!/usr/bin/env node
'use strict';

/**
 * Migration: Update background_tasks status constraint to include abandoned.
 *
 * DB-owned schema inspection and table rewrite logic lives in news-crawler-db.
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { findProjectRoot } = require('../../src/shared/utils/project-root');

function getTaskStatusMigrationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'getBackgroundTasksSchemaSql',
    'isBackgroundTaskStatusConstraintUpdated',
    'migrateBackgroundTaskStatusConstraint'
  ];

  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

function resolveDbPath(argv = process.argv.slice(2)) {
  const dbIndex = argv.indexOf('--db');
  if (dbIndex !== -1 && argv[dbIndex + 1]) {
    return argv[dbIndex + 1];
  }

  const projectRoot = findProjectRoot(__dirname);
  return path.join(projectRoot, 'data', 'news.db');
}

function migrate(dbPath) {
  const db = openNewsCrawlerDb(dbPath);

  try {
    return getTaskStatusMigrationApi().migrateBackgroundTaskStatusConstraint(db);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const dbPath = resolveDbPath();
  console.log(`[Migration] Using database: ${dbPath}`);

  try {
    const result = migrate(dbPath);
    if (result.previousSchemaSql) {
      console.log('[Migration] Previous schema:');
      console.log(result.previousSchemaSql);
    }
    if (result.schemaSql) {
      console.log('[Migration] Current schema:');
      console.log(result.schemaSql);
    }
    console.log('[Migration] Result:', result);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  resolveDbPath,
  migrate
};
