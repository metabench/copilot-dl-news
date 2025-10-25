#!/usr/bin/env node

/**
 * find-compression-settings - Analyze database compression settings usage
 *
 * Shows which compression settings are used across different tables and how many
 * records use each compression configuration.
 *
 * Usage:
 *   node tools/find-compression-settings.js [options]
 *
 * Options:
 *   --help, -h               Show this help message
 *   --verbose                Enable verbose output
 */

const path = require('path');
const { openDatabase } = require('../src/db/sqlite/v1/connection');
const {
  findTablesWithCompression,
  getTableRecordCount,
  getCompressionStats
} = require('../src/db/sqlite/v1/queries/compression');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Find Compression Settings Tool

Analyzes the database to show which compression settings are used across different
tables and how many records use each compression configuration.

USAGE:
  node tools/find-compression-settings.js [options]

OPTIONS:
  --verbose, -v              Enable verbose output
  --help, -h                 Show this help message

OUTPUT:
  Shows tables that support compression, compression settings used, and record counts
  for each compression configuration.
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);
let verbose = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  switch (arg) {
    case '--verbose':
    case '-v':
      verbose = true;
      break;
    default:
      if (arg.startsWith('--')) {
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
      } else {
        console.error(`Unexpected argument: ${arg}`);
        process.exit(1);
      }
  }
}

console.log(`${colors.cyan}FIND COMPRESSION SETTINGS${colors.reset}`);
console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);

// Open database
const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });

try {
  // Find all tables that have compression-related columns
  const tablesWithCompression = findTablesWithCompressionLocal(db);

  if (tablesWithCompression.length === 0) {
    console.log(`${colors.yellow}No tables with compression support found.${colors.reset}`);
    process.exit(0);
  }

  console.log(`Found ${tablesWithCompression.length} table(s) with compression support:\n`);

  for (const tableInfo of tablesWithCompression) {
    console.log(`${colors.green}Table: ${tableInfo.tableName}${colors.reset}`);
    console.log(`  Compression Column: ${tableInfo.compressionColumn}`);
    console.log(`  Reference Table: ${tableInfo.referenceTable}`);

    // Get compression statistics for this table
    const compressionStats = getCompressionStatsLocal(db, tableInfo);
    tableInfo.compressionStats = compressionStats; // Store for summary

    if (compressionStats.length === 0) {
      console.log(`  ${colors.yellow}No compressed records found${colors.reset}`);
    } else {
      console.log(`  ${colors.blue}Compression Usage:${colors.reset}`);

      // Sort by count descending
      compressionStats.sort((a, b) => b.count - a.count);

      for (const stat of compressionStats) {
        const percentage = ((stat.count / tableInfo.totalRecords) * 100).toFixed(1);
        const settings = formatCompressionSettings(stat);
        console.log(`    ${settings}: ${stat.count.toLocaleString()} records (${percentage}%)`);
      }

      // Show uncompressed records if any
      const compressedCount = compressionStats.reduce((sum, stat) => sum + stat.count, 0);
      const uncompressedCount = tableInfo.totalRecords - compressedCount;
      if (uncompressedCount > 0) {
        const uncompressedPercentage = ((uncompressedCount / tableInfo.totalRecords) * 100).toFixed(1);
        console.log(`    ${colors.yellow}Uncompressed: ${uncompressedCount.toLocaleString()} records (${uncompressedPercentage}%)${colors.reset}`);
      }
    }

    console.log(`  ${colors.blue}Total Records: ${tableInfo.totalRecords.toLocaleString()}${colors.reset}\n`);
  }

  // Summary
  console.log(`${colors.magenta}SUMMARY${colors.reset}`);
  const totalCompressedRecords = tablesWithCompression.reduce((sum, table) => {
    return sum + table.compressionStats.reduce((tableSum, stat) => tableSum + stat.count, 0);
  }, 0);

  const totalRecords = tablesWithCompression.reduce((sum, table) => sum + table.totalRecords, 0);

  console.log(`Total records across all tables: ${totalRecords.toLocaleString()}`);
  console.log(`Total compressed records: ${totalCompressedRecords.toLocaleString()}`);
  console.log(`Compression coverage: ${totalRecords > 0 ? ((totalCompressedRecords / totalRecords) * 100).toFixed(1) : 0}%`);

} finally {
  db.close();
}

function findTablesWithCompressionLocal(db) {
  const tables = [];

  // Query to find tables with compression_type_id columns
  const compressionTables = findTablesWithCompression(db);

  for (const table of compressionTables) {
    // Get total record count for this table
    const totalRecords = getTableRecordCount(db, table.table_name);

    tables.push({
      tableName: table.table_name,
      compressionColumn: table.column_name,
      referenceTable: 'compression_types',
      totalRecords: totalRecords,
      compressionStats: [] // Will be populated later
    });
  }

  return tables;
}

function getCompressionStatsLocal(db, tableInfo) {
  const stats = [];

  try {
    const results = getCompressionStats(db, tableInfo);
    stats.push(...results);
  } catch (error) {
    if (verbose) {
      console.error(`Error querying ${tableInfo.tableName}: ${error.message}`);
    }
  }

  return stats;
}

function formatCompressionSettings(stat) {
  const parts = [];

  if (stat.algorithm) {
    parts.push(stat.algorithm);
  }

  if (stat.level !== null && stat.level !== undefined) {
    parts.push(`level ${stat.level}`);
  }

  if (stat.window_bits !== null && stat.window_bits !== undefined && stat.algorithm === 'brotli') {
    parts.push(`${stat.window_bits} bits`);
  }

  return parts.join(', ');
}