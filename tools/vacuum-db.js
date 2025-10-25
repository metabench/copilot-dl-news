#!/usr/bin/env node

/**
 * vacuum-db.js - Vacuum SQLite database to reclaim unused space
 *
 * Usage:
 *   node tools/vacuum-db.js              # Vacuum default database (data/news.db)
 *   node tools/vacuum-db.js --db=path    # Vacuum specific database
 *   node tools/vacuum-db.js --help       # Show help
 */

const fs = require('fs');
const path = require('path');
const { ensureDb } = require('../src/db/sqlite/ensureDb');
const { vacuumDatabase } = require('../src/db/sqlite/v1/queries/maintenance');

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function calculatePercentage(before, after) {
  if (before === 0) return 0;
  return ((before - after) / before * 100).toFixed(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = path.join(__dirname, '../data/news.db');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      console.log(`
Vacuum SQLite Database Tool

Usage: node tools/vacuum-db.js [options]

Options:
  --db=path     Path to SQLite database file (default: data/news.db)
  --help, -h    Show this help message

Examples:
  node tools/vacuum-db.js                    # Vacuum default database
  node tools/vacuum-db.js --db=./data/test.db  # Vacuum specific database

This tool will:
1. Check the current database file size
2. Run VACUUM to reclaim unused space
3. Show the new file size and space saved
`);
      process.exit(0);
    }

    if (arg.startsWith('--db=')) {
      dbPath = arg.split('=')[1];
    }
  }

  return { dbPath };
}

async function main() {
  const { dbPath } = parseArgs();

  console.log('='.repeat(60));
  console.log('VACUUM SQLITE DATABASE');
  console.log('='.repeat(60));

  // Check if database file exists
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database file not found: ${dbPath}`);
    process.exit(1);
  }

  const sizeBefore = getFileSize(dbPath);
  if (sizeBefore === null) {
    console.error(`❌ Cannot read file size: ${dbPath}`);
    process.exit(1);
  }

  console.log(`Database: ${dbPath}`);
  console.log(`Size before vacuum: ${formatBytes(sizeBefore)}`);

  try {
    // Open database and run vacuum
    console.log('\nRunning VACUUM...');
    const db = ensureDb(dbPath);

    // Run vacuum
    vacuumDatabase(db);

    db.close();

    // Check size after vacuum
    const sizeAfter = getFileSize(dbPath);
    if (sizeAfter === null) {
      console.error(`❌ Cannot read file size after vacuum: ${dbPath}`);
      process.exit(1);
    }

    const saved = sizeBefore - sizeAfter;
    const percentage = calculatePercentage(sizeBefore, sizeAfter);

    console.log(`Size after vacuum:  ${formatBytes(sizeAfter)}`);
    console.log(`Space saved:        ${formatBytes(saved)} (${percentage}%)`);

    if (saved > 0) {
      console.log('\n✅ Database vacuumed successfully!');
    } else {
      console.log('\nℹ️  No space was reclaimed (database was already optimized)');
    }

  } catch (error) {
    console.error('❌ Error during vacuum operation:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);