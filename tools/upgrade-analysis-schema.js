#!/usr/bin/env node
/**
 * Upgrade analysis_runs schema to add background_task columns.
 * Run this manually if you want to add the columns without waiting for next server start.
 * 
 * Usage:
 *   node tools/upgrade-analysis-schema.js
 *   DB_PATH=./data/test.db node tools/upgrade-analysis-schema.js
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

function main() {
  const dbPath = getDbPath();
  console.log(`Upgrading schema in: ${dbPath}`);
  
  const db = new Database(dbPath, { readonly: false });
  
  try {
    // Check current columns
    const beforeColumns = db.prepare(`PRAGMA table_info('analysis_runs')`).all();
    const beforeNames = new Set(beforeColumns.map(col => col.name));
    
    console.log(`\nBefore: ${beforeColumns.length} columns`);
    
    // Import the service to run the schema upgrade
    const { ensureAnalysisRunSchema } = require('../src/deprecated-ui/express/services/analysisRuns');
    
    ensureAnalysisRunSchema(db);
    
    // Check after
    const afterColumns = db.prepare(`PRAGMA table_info('analysis_runs')`).all();
    const afterNames = new Set(afterColumns.map(col => col.name));
    
    console.log(`After: ${afterColumns.length} columns`);
    
    // Show what was added
    const added = afterColumns.filter(col => !beforeNames.has(col.name));
    if (added.length > 0) {
      console.log('\nAdded columns:');
      added.forEach(col => {
        console.log(`  - ${col.name} (${col.type})`);
      });
    } else {
      console.log('\nNo new columns added (already up to date)');
    }
    
    // Check indexes
    const indexes = db.prepare(`
      SELECT name 
      FROM sqlite_master 
      WHERE type='index' AND tbl_name='analysis_runs'
    `).all();
    
    console.log(`\nIndexes on analysis_runs: ${indexes.length}`);
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}`);
    });
    
    console.log('\n✓ Schema upgrade complete');
    
  } catch (err) {
    console.error('\n✗ Upgrade failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
