#!/usr/bin/env node

/**
 * Database URL Normalization: Validation Script
 *
 * Validates that URL normalization migrations have been completed successfully
 * and that all URL references are properly normalized.
 */

const path = require('path');
const { ensureDb } = require('../../data/db/sqlite/ensureDb');
const { UrlResolver } = require('../../shared/utils/UrlResolver');
const { findProjectRoot } = require('../../shared/utils/project-root');
// Schema-introspection is DB-shaped logic — delegated to ncdb (thin-coordination).
// These are the exact queries that used to be inline here (byte-equivalent, now
// with safe identifier quoting); see news-crawler-db legacy-schemaInspection.
const {
  schemaInspectionTableExists,
  getTableRowCount,
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getColumnFillStats,
  getOrphanedReferenceCount,
  getColumnValueStats
} = require('news-crawler-db');

const TABLES_TO_CHECK = [
  {
    name: 'article_places',
    urlColumn: 'article_url',
    idColumn: 'article_url_id'
  },
  {
    name: 'place_hubs',
    urlColumn: 'url',
    idColumn: 'url_id'
  },
  {
    name: 'place_hub_candidates',
    urlColumns: ['candidate_url', 'normalized_url'],
    idColumns: ['candidate_url_id', 'normalized_url_id']
  },
  {
    name: 'place_hub_unknown_terms',
    urlColumns: ['canonical_url', 'url'],
    idColumns: ['canonical_url_id', 'url_id']
  },
  {
    name: 'fetches',
    urlColumn: 'url',
    idColumn: 'url_id'
  }
];

async function validateUrlNormalization(dbPath) {
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = dbPath || path.join(projectRoot, 'data', 'news.db');

  console.log('🔍 Validating URL normalization...');
  console.log(`📁 Database: ${resolvedDbPath}`);

  const db = ensureDb(resolvedDbPath);
  const urlResolver = new UrlResolver(db);

  try {
    const results = {
      overall: { valid: true, errors: [], warnings: [] },
      tables: {}
    };

    // Check URLs table exists and has data
    console.log('\n📊 Checking urls table...');
    const urlsStats = urlResolver.getStats();
    console.log(`   Total URLs: ${urlsStats.totalUrls}`);
    console.log(`   Recent URLs: ${urlsStats.recentUrls}`);

    if (urlsStats.totalUrls === 0) {
      results.overall.errors.push('urls table is empty - normalization infrastructure not ready');
      results.overall.valid = false;
    }

    // Check each table
    for (const table of TABLES_TO_CHECK) {
      console.log(`\n🔍 Checking table: ${table.name}`);
      const tableResult = {
        exists: false,
        rowCount: 0,
        normalized: false,
        errors: [],
        warnings: []
      };

      // Check if table exists
      const tableExists = schemaInspectionTableExists(db, table.name);

      if (!tableExists) {
        tableResult.errors.push(`Table ${table.name} does not exist`);
        results.tables[table.name] = tableResult;
        continue;
      }

      tableResult.exists = true;

      // Get row count
      const rowCount = getTableRowCount(db, table.name);
      tableResult.rowCount = rowCount;
      console.log(`   Rows: ${rowCount}`);

      // Check for ID columns (normalized)
      const idColumns = table.idColumns || (table.idColumn ? [table.idColumn] : []);

      if (idColumns.length > 0) {
        let allColumnsExist = true;
        let totalWithId = 0;
        let totalWithoutId = 0;
        let totalOrphaned = 0;

        for (const idCol of idColumns) {
          const idColumnExists = getTableInfo(db, table.name).some(c => c.name === idCol);

          if (!idColumnExists) {
            tableResult.errors.push(`Missing ${idCol} column`);
            allColumnsExist = false;
            continue;
          }

          // Check how many rows have the ID set
          const idStats = getColumnFillStats(db, table.name, idCol);

          totalWithId += idStats.with_value;
          totalWithoutId += idStats.without_value;

          // Check for orphaned references
          const orphaned = getOrphanedReferenceCount(db, table.name, idCol, 'urls', 'id');

          totalOrphaned += orphaned;

          // Check index coverage for the ID column
          const indexList = getTableIndexes(db, table.name);
          const hasCoveringIndex = indexList.some(index => {
            if (!index.name || index.name.startsWith('sqlite_autoindex')) {
              return false;
            }
            const indexInfo = getIndexInfo(db, index.name);
            return indexInfo.some(info => info.name === idCol);
          });

          if (!hasCoveringIndex) {
            tableResult.warnings.push(`Missing index covering ${idCol}`);
          }
        }

        if (allColumnsExist) {
          console.log(`   ✅ Has ${idColumns.join(', ')} columns`);
          console.log(`   📊 ID columns stats: ${totalWithId}/${rowCount * idColumns.length} total IDs have values`);

          if (totalWithoutId > 0) {
            tableResult.warnings.push(`${totalWithoutId} ID values still missing`);
          }

          if (totalOrphaned > 0) {
            tableResult.errors.push(`${totalOrphaned} orphaned ID references`);
            results.overall.valid = false;
          }

          tableResult.normalized = (totalWithoutId === 0 && totalOrphaned === 0);
        } else {
          results.overall.valid = false;
        }
      }

      // Check for denormalized URL columns
      const urlColumns = table.urlColumns || (table.urlColumn ? [table.urlColumn] : []);

      for (const urlCol of urlColumns) {
        const columnExists = getTableInfo(db, table.name).some(c => c.name === urlCol);

        if (columnExists) {
          const urlStats = getColumnValueStats(db, table.name, urlCol);

          console.log(`   📊 ${urlCol}: ${urlStats.with_value} non-null values, ${urlStats.unique_values} unique`);

          if (urlStats.with_value > 0) {
            const message = `Denormalized ${urlCol} column still populated (${urlStats.with_value} rows)`;
            tableResult.errors.push(message);
            results.overall.valid = false;
          } else {
            tableResult.warnings.push(`Denormalized ${urlCol} column exists but is empty`);
          }
        } else {
          console.log(`   ✅ ${urlCol} column absent (legacy TEXT data removed)`);
        }
      }

      results.tables[table.name] = tableResult;

      // Add table errors/warnings to overall results
      results.overall.errors.push(...tableResult.errors.map(e => `${table.name}: ${e}`));
      results.overall.warnings.push(...tableResult.warnings.map(w => `${table.name}: ${w}`));
    }

    // Summary
    console.log('\n📋 Validation Summary:');
    console.log(`Overall status: ${results.overall.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`Errors: ${results.overall.errors.length}`);
    console.log(`Warnings: ${results.overall.warnings.length}`);

    if (results.overall.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.overall.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (results.overall.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      results.overall.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    // Table status summary
    console.log('\n📊 Table Status:');
    for (const [tableName, tableResult] of Object.entries(results.tables)) {
      const status = tableResult.exists
        ? (tableResult.normalized ? '✅' : '⚠️ ')
        : '❌';
      console.log(`   ${status} ${tableName}: ${tableResult.rowCount} rows${tableResult.normalized ? ' (normalized)' : ''}`);
    }

    return results;

  } finally {
    try {
      db.close();
    } catch (error) {
      console.warn('Warning: Error closing database connection:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const dbPath = args[0]; // Optional database path

  try {
    const results = await validateUrlNormalization(dbPath);

    if (results.overall.valid) {
      console.log('\n🎉 URL normalization validation passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  URL normalization validation found issues!');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Fatal error during validation:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateUrlNormalization
};