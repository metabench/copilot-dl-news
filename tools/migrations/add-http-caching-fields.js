#!/usr/bin/env node
'use strict';

/**
 * HTTP Caching Schema Migration
 *
 * Adds cache metadata fields to existing http_responses and content_storage tables
 * to support unified HTTP request/response caching for APIs and web content.
 *
 * This migration is safe to run multiple times (idempotent).
 */

const path = require('path');
const Database = require('better-sqlite3');
const { CliFormatter } = require('../../src/utils/CliFormatter');

const fmt = new CliFormatter();
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

function openDatabase() {
  try {
    return new Database(DB_PATH);
  } catch (error) {
    fmt.error(`Failed to open database: ${error.message}`);
    process.exit(1);
  }
}

function columnExists(db, tableName, columnName) {
  const columns = db.prepare(`
    SELECT name FROM pragma_table_info(?)
    WHERE name = ?
  `).get(tableName, columnName);
  return !!columns;
}

function addHttpResponseCacheFields(db) {
  fmt.info('Adding cache fields to http_responses table...');

  const fields = [
    { name: 'request_method', type: 'TEXT', default: "'GET'" },
    { name: 'cache_category', type: 'TEXT', default: null },
    { name: 'cache_key', type: 'TEXT', default: null },
    { name: 'cache_created_at', type: 'TEXT', default: null },
    { name: 'cache_expires_at', type: 'TEXT', default: null }
  ];

  for (const field of fields) {
    if (!columnExists(db, 'http_responses', field.name)) {
      fmt.info(`  Adding column: ${field.name}`);
      db.prepare(`
        ALTER TABLE http_responses
        ADD COLUMN ${field.name} ${field.type} ${field.default ? `DEFAULT ${field.default}` : ''}
      `).run();
    } else {
      fmt.info(`  Column ${field.name} already exists`);
    }
  }
}

function addContentStorageCategoryFields(db) {
  fmt.info('Adding category fields to content_storage table...');

  const fields = [
    { name: 'content_category', type: 'TEXT', default: null },
    { name: 'content_subtype', type: 'TEXT', default: null }
  ];

  for (const field of fields) {
    if (!columnExists(db, 'content_storage', field.name)) {
      fmt.info(`  Adding column: ${field.name}`);
      db.prepare(`
        ALTER TABLE content_storage
        ADD COLUMN ${field.name} ${field.type} ${field.default ? `DEFAULT ${field.default}` : ''}
      `).run();
    } else {
      fmt.info(`  Column ${field.name} already exists`);
    }
  }
}

function createCacheIndexes(db) {
  fmt.info('Creating cache indexes for performance...');

  const indexes = [
    {
      name: 'idx_http_responses_cache_key_category',
      sql: 'CREATE INDEX IF NOT EXISTS idx_http_responses_cache_key_category ON http_responses(cache_key, cache_category)'
    },
    {
      name: 'idx_http_responses_cache_expires_at',
      sql: 'CREATE INDEX IF NOT EXISTS idx_http_responses_cache_expires_at ON http_responses(cache_expires_at)'
    },
    {
      name: 'idx_content_storage_category',
      sql: 'CREATE INDEX IF NOT EXISTS idx_content_storage_category ON content_storage(content_category, content_subtype)'
    }
  ];

  for (const index of indexes) {
    fmt.info(`  Creating index: ${index.name}`);
    db.prepare(index.sql).run();
  }
}

function validateMigration(db) {
  fmt.info('Validating migration...');

  // Check http_responses table
  const httpResponseFields = ['request_method', 'cache_category', 'cache_key', 'cache_created_at', 'cache_expires_at'];
  for (const field of httpResponseFields) {
    if (!columnExists(db, 'http_responses', field)) {
      throw new Error(`Missing field ${field} in http_responses table`);
    }
  }

  // Check content_storage table
  const contentStorageFields = ['content_category', 'content_subtype'];
  for (const field of contentStorageFields) {
    if (!columnExists(db, 'content_storage', field)) {
      throw new Error(`Missing field ${field} in content_storage table`);
    }
  }

  fmt.success('Migration validation passed');
}

function main() {
  fmt.header('HTTP Caching Schema Migration');
  fmt.settings(`Database: ${DB_PATH}`);

  const db = openDatabase();

  try {
    db.prepare('BEGIN').run();

    addHttpResponseCacheFields(db);
    addContentStorageCategoryFields(db);
    createCacheIndexes(db);
    validateMigration(db);

    db.prepare('COMMIT').run();

    fmt.success('Migration completed successfully!');
    fmt.info('The database now supports unified HTTP request/response caching.');

  } catch (error) {
    db.prepare('ROLLBACK').run();
    fmt.error(`Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };