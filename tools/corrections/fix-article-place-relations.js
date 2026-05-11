#!/usr/bin/env node

/**
 * Fix article_place_relations foreign key constraint.
 *
 * SQL and table-rebuild ownership live in news-crawler-db; this file only
 * opens the configured database and reports the migration result.
 */

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function closeDb(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

function fixArticlePlaceRelations() {
  console.log('Fixing article_place_relations foreign key constraint...');

  const dbPath = process.env.DB_PATH || './data/news.db';
  const fixForeignKey = getDbApi('fixArticlePlaceRelationsForeignKey');
  const db = openNewsCrawlerDb(dbPath);

  try {
    const report = fixForeignKey(db);

    console.log('Current table SQL:', report.oldSql);
    console.log('Fixed article_place_relations foreign key constraint');
    console.log(`Copied rows: ${report.copiedRows}`);
    console.log(`Rows before: ${report.beforeCount}`);
    console.log(`Rows after: ${report.afterCount}`);
    console.log('New table SQL:', report.newSql);
  } catch (error) {
    console.error('Failed to fix foreign key:', error.message);
    process.exitCode = 1;
  } finally {
    closeDb(db);
  }
}

if (require.main === module) {
  fixArticlePlaceRelations();
}

module.exports = { fixArticlePlaceRelations };
