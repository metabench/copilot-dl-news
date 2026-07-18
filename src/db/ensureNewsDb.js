'use strict';

/**
 * Coordination-point wrapper over ncdb's connection surface (B10c).
 *
 * DB mechanics (open, schema ensure with the fingerprint fast path,
 * crawl-type + bootstrap seeding) live in news-crawler-db
 * (openSqliteNewsDatabase / ensureSqliteNewsDatabase). What stays here is
 * the PROJECT wiring the retired src/data/db/sqlite/v1 core carried:
 * project-root discovery of data/bootstrap/bootstrap-db.json, the default
 * data/news.db path, and the schema-ensured NewsDatabase factory.
 * Exported names are the historical ones.
 */

const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../shared/utils/project-root');
const { readBootstrapJson } = require('../shared/utils/bootstrapGuard');
const ncdb = require('news-crawler-db');

const NewsDatabase = ncdb.NewsDatabase || ncdb.SQLiteNewsDatabase;

function loadBootstrapData(logger = console) {
  try {
    const projectRoot = findProjectRoot(__dirname);
    const bootstrapPath = path.join(projectRoot, 'data', 'bootstrap', 'bootstrap-db.json');
    return readBootstrapJson(bootstrapPath);
  } catch (error) {
    (logger || console).error('Failed to load bootstrap data:', error);
  }
  return null;
}

function openDatabase(dbPath, options = {}) {
  return ncdb.openSqliteNewsDatabase(dbPath, options);
}

function ensureDatabase(dbPath, options = {}) {
  const wantsSchema = !options.skipSchema && !options.readonly;
  return ncdb.ensureSqliteNewsDatabase(dbPath, {
    ...options,
    bootstrapData: wantsSchema ? loadBootstrapData(options.logger) : undefined
  });
}

function ensureDb(dbFilePath, options = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const filePath = dbFilePath || path.join(projectRoot, 'data', 'news.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return ensureDatabase(filePath, options);
}

// Schema-ensured factory (the retired v1 barrel's contract — ncdb's own
// createSQLiteDatabase opens WITHOUT ensuring schema; do not confuse).
function createSQLiteDatabase(inputOptions = {}) {
  const normalized = typeof inputOptions === 'string' ? { dbPath: inputOptions } : { ...(inputOptions || {}) };
  const dbPath = normalized.dbPath || normalized.dbFilePath;
  if (!dbPath) {
    throw new Error('createSQLiteDatabase requires a dbPath');
  }
  const dbHandle = ensureDb(dbPath);
  const newsDb = new NewsDatabase(dbHandle);
  newsDb.core = dbHandle;
  newsDb.usesNewsCrawlerDb = true;
  return newsDb;
}

function ensureGazetteer(db) {
  return ncdb.initSqliteV1GazetteerTables(db, { verbose: false, logger: console });
}

// Historical helper from the retired v1 barrel (B11f: export-gazetteer
// still destructured it from the sqlite barrel, silently undefined
// since B10c).
function openDbReadOnly(dbPath) {
  return openDatabase(dbPath, { readonly: true, fileMustExist: true });
}

module.exports = {
  NewsDatabase,
  openDatabase,
  openDbReadOnly,
  ensureDatabase,
  ensureDb,
  createSQLiteDatabase,
  ensureGazetteer
};
