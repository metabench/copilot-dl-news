#!/usr/bin/env node
/**
 * Database query runner - execute read-only queries without approval dialogs.
 * 
 * Usage:
 *   node tools/db-query.js "SELECT * FROM articles LIMIT 5"
 *   node tools/db-query.js "SELECT COUNT(*) FROM articles WHERE host='bbc.co.uk'"
 *   node tools/db-query.js --json "SELECT * FROM analysis_runs ORDER BY started_at DESC LIMIT 3"
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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

function formatTable(rows) {
  if (!rows || rows.length === 0) {
    return '(no results)';
  }
  
  const keys = Object.keys(rows[0]);
  const maxWidths = {};
  
  keys.forEach(key => {
    maxWidths[key] = Math.max(
      key.length,
      ...rows.map(row => {
        const val = row[key];
        if (val === null) return 4; // 'null'
        return String(val).length;
      })
    );
  });
  
  const lines = [];
  const header = keys.map(key => key.padEnd(maxWidths[key])).join(' | ');
  const separator = keys.map(key => '-'.repeat(maxWidths[key])).join('-+-');
  
  lines.push(header);
  lines.push(separator);
  
  rows.forEach(row => {
    const line = keys.map(key => {
      const val = row[key];
      const str = val === null ? 'null' : String(val);
      return str.padEnd(maxWidths[key]);
    }).join(' | ');
    lines.push(line);
  });
  
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(`
Database Query Runner (read-only)

Usage:
  node tools/db-query.js [--json] "<SQL query>"

Options:
  --json                    Output results as JSON

Environment:
  DB_PATH                   Path to SQLite database (default: data/news.db)

Examples:
  node tools/db-query.js "SELECT * FROM articles LIMIT 5"
  node tools/db-query.js "SELECT COUNT(*) as count FROM articles WHERE host='bbc.co.uk'"
  node tools/db-query.js --json "SELECT * FROM analysis_runs ORDER BY started_at DESC LIMIT 3"

Security:
  - Database opened in read-only mode
  - Only SELECT queries permitted
  - Write operations will fail
`);
    process.exit(0);
  }
  
  let outputJson = false;
  let query;
  
  if (args[0] === '--json') {
    outputJson = true;
    query = args.slice(1).join(' ');
  } else {
    query = args.join(' ');
  }
  
  if (!query) {
    console.error('Error: SQL query required');
    process.exit(1);
  }
  
  // Basic safety check (database is read-only anyway)
  const normalized = query.trim().toLowerCase();
  if (!normalized.startsWith('select') && 
      !normalized.startsWith('pragma') && 
      !normalized.startsWith('explain')) {
    console.error('Error: Only SELECT, PRAGMA, and EXPLAIN queries permitted');
    console.error('Database is opened in read-only mode for safety');
    process.exit(1);
  }
  
  const dbPath = getDbPath();
  const db = new Database(dbPath, { readonly: true });
  
  try {
    const stmt = db.prepare(query);
    let results;
    
    // Check if query returns rows
    if (normalized.startsWith('pragma') || 
        normalized.includes('returning') || 
        !/^(insert|update|delete)/i.test(normalized)) {
      results = stmt.all();
    } else {
      // Just run it
      const info = stmt.run();
      results = [{ changes: info.changes, lastInsertRowid: info.lastInsertRowid }];
    }
    
    if (outputJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('');
      console.log(formatTable(results));
      console.log('');
      console.log(`${results.length} row${results.length === 1 ? '' : 's'} returned`);
    }
  } catch (err) {
    console.error('Query error:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
