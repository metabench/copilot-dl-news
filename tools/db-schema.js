#!/usr/bin/env node
/**
 * Database schema inspector - query table structure, indexes, and metadata
 * without approval dialogs.
 * 
 * Usage:
 *   node tools/db-schema.js tables                    # List all tables
 *   node tools/db-schema.js table articles            # Show columns for 'articles'
 *   node tools/db-schema.js indexes                   # List all indexes
 *   node tools/db-schema.js indexes articles          # Show indexes for 'articles'
 *   node tools/db-schema.js foreign-keys articles     # Show foreign keys for 'articles'
 *   node tools/db-schema.js stats                     # Show table row counts
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getTableIndexNames,
  getAllTablesAndViews,
  tableExists,
  getAllIndexes,
  getForeignKeys,
  getAllTables,
  getTableRowCount
} = require('../src/db/sqlite/v1/queries/schema');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

function getDbPath() {
  const envPath = process.env.DB_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  if (fs.existsSync(DEFAULT_DB_PATH)) {
    return DEFAULT_DB_PATH;
  }
  console.error('Error: Database not found at', DEFAULT_DB_PATH);
  console.error('Set DB_PATH environment variable or create data/news.db');
  process.exit(1);
}

function formatTable(rows, options = {}) {
  if (!rows || rows.length === 0) {
    return '(no results)';
  }
  
  const keys = Object.keys(rows[0]);
  const maxWidths = {};
  
  keys.forEach(key => {
    maxWidths[key] = Math.max(
      key.length,
      ...rows.map(row => String(row[key] || '').length)
    );
  });
  
  const lines = [];
  const header = keys.map(key => key.padEnd(maxWidths[key])).join(' | ');
  const separator = keys.map(key => '-'.repeat(maxWidths[key])).join('-+-');
  
  lines.push(header);
  lines.push(separator);
  
  rows.forEach(row => {
    const line = keys.map(key => String(row[key] || '').padEnd(maxWidths[key])).join(' | ');
    lines.push(line);
  });
  
  return lines.join('\n');
}

function listTables(db) {
  const tables = getAllTablesAndViews(db);
  
  console.log(`\n${tables.length} tables/views found:\n`);
  console.log(formatTable(tables));
}

function describeTable(db, tableName) {
  // Check if table exists
  const exists = tableExists(db, tableName);
  
  if (!exists) {
    console.error(`Error: Table '${tableName}' not found`);
    process.exit(1);
  }
  
  const columns = getTableInfo(db, tableName);
  
  console.log(`\nTable: ${tableName}`);
  console.log(`${columns.length} columns:\n`);
  
  const formatted = columns.map(col => ({
    cid: col.cid,
    name: col.name,
    type: col.type,
    notnull: col.notnull ? 'NOT NULL' : '',
    default: col.dflt_value || '',
    pk: col.pk ? 'PK' : ''
  }));
  
  console.log(formatTable(formatted));
}

function listIndexes(db, tableName = null) {
  let indexes;
  
  if (tableName) {
    indexes = getTableIndexes(db, tableName);
    console.log(`\nIndexes for table '${tableName}':\n`);
  } else {
    indexes = getAllIndexes(db);
    console.log(`\n${indexes.length} indexes found:\n`);
  }
  
  if (indexes.length === 0) {
    console.log('(no indexes)');
    return;
  }
  
  if (tableName) {
    // Detailed view for single table
    indexes.forEach(idx => {
      console.log(`Index: ${idx.name}${idx.unique ? ' (UNIQUE)' : ''}`);
      const info = getIndexInfo(db, idx.name);
      info.forEach(col => {
        console.log(`  ${col.seqno}: ${col.name}`);
      });
      console.log('');
    });
  } else {
    // Summary view for all tables
    const formatted = indexes.map(idx => ({
      name: idx.name,
      table: idx.tbl_name
    }));
    console.log(formatTable(formatted));
  }
}

function listForeignKeys(db, tableName) {
  const exists = tableExists(db, tableName);
  
  if (!exists) {
    console.error(`Error: Table '${tableName}' not found`);
    process.exit(1);
  }
  
  const fks = getForeignKeys(db, tableName);
  
  console.log(`\nForeign keys for table '${tableName}':\n`);
  
  if (fks.length === 0) {
    console.log('(no foreign keys)');
    return;
  }
  
  const formatted = fks.map(fk => ({
    id: fk.id,
    from: fk.from,
    to_table: fk.table,
    to_column: fk.to,
    on_update: fk.on_update,
    on_delete: fk.on_delete
  }));
  
  console.log(formatTable(formatted));
}

function showStats(db) {
  const tables = getAllTables(db);
  
  console.log(`\nCounting rows in ${tables.length} tables...\n`);
  
  const stats = [];
  for (let i = 0; i < tables.length; i++) {
    const { name } = tables[i];
    process.stderr.write(`\r[${i + 1}/${tables.length}] ${name}...`.padEnd(60));
    try {
      const count = getTableRowCount(db, name);
      stats.push({ table: name, rows: count });
    } catch (err) {
      stats.push({ table: name, rows: 'ERROR' });
    }
  }
  process.stderr.write('\r' + ' '.repeat(60) + '\r');
  
  console.log(formatTable(stats));
  
  // Database file info
  const dbPath = db.name;
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`\nDatabase: ${dbPath}`);
    console.log(`Size: ${sizeMB} MB`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];
  
  if (!command || command === 'help' || command === '--help') {
    console.log(`
Database Schema Inspector

Usage:
  node tools/db-schema.js <command> [options]

Commands:
  tables                    List all tables and views
  table <name>              Show column details for a table
  indexes                   List all indexes
  indexes <table>           Show indexes for a specific table
  foreign-keys <table>      Show foreign keys for a table
  stats                     Show table row counts and database size

Environment:
  DB_PATH                   Path to SQLite database (default: data/news.db)

Examples:
  node tools/db-schema.js tables
  node tools/db-schema.js table analysis_runs
  node tools/db-schema.js indexes analysis_runs
  node tools/db-schema.js stats
`);
    process.exit(0);
  }
  
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly: true });
  
  try {
    switch (command) {
      case 'tables':
        listTables(db);
        break;
      case 'table':
        if (!param) {
          console.error('Error: table name required');
          process.exit(1);
        }
        describeTable(db, param);
        break;
      case 'indexes':
        listIndexes(db, param);
        break;
      case 'foreign-keys':
        if (!param) {
          console.error('Error: table name required');
          process.exit(1);
        }
        listForeignKeys(db, param);
        break;
      case 'stats':
        showStats(db);
        break;
      default:
        console.error(`Error: Unknown command '${command}'`);
        console.error('Run "node tools/db-schema.js help" for usage');
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main();
