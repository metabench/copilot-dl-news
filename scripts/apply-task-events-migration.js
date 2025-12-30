'use strict';

/**
 * Apply the task_events migration to the live database.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/news.db');
const migrationPath = path.join(__dirname, '../src/db/sqlite/v1/migrations/add_task_events_table.sql');

console.log(`Applying migration to: ${dbPath}`);

const db = new Database(dbPath);
const sql = fs.readFileSync(migrationPath, 'utf8');

db.exec(sql);
console.log('✓ Migration applied');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'").all();
console.log(`✓ task_events exists: ${tables.length > 0}`);

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_events'").all();
console.log(`✓ ${indexes.length} indexes created`);

db.close();
console.log('Done');
