#!/usr/bin/env node

/**
 * Database URL Normalization: Validation Script
 *
 * Validates that URL normalization migrations have been completed successfully
 * and that all URL references are properly normalized.
 */

const path = require('path');
const { ensureDb } = require('../../db/sqlite/ensureDb');
const { UrlResolver } = require('../../utils/UrlResolver');
const { findProjectRoot } = require('../../utils/project-root');

const TABLES_TO_CHECK = [
  {
    name: 'article_places',
    urlColumn: 'article_url',
    idColumn: 'article_url_id',
    expectedRows: 9808
  },
  {
    name: 'place_hubs',
    urlColumn: 'url',
    idColumn: 'url_id',
    expectedRows: 94
  },
  {
    name: 'place_hub_candidates',
    urlColumns: ['candidate_url', 'normalized_url'],
    idColumns: ['candidate_url_id', 'normalized_url_id'],
    expectedRows: 406
  },
  {
    name: 'place_hub_unknown_terms',
    urlColumns: ['canonical_url', 'url'],
    idColumns: ['canonical_url_id', 'url_id'],
    expectedRows: 4285
  },
  {
    name: 'fetches',
    urlColumn: 'url',
    idColumn: 'url_id',
    expectedRows: 479
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
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(table.name);

      if (!tableExists) {
        tableResult.errors.push(`Table ${table.name} does not exist`);
        results.tables[table.name] = tableResult;
        continue;
      }

      tableResult.exists = true;

      // Get row count
      const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
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
          const idColumnExists = db.prepare(`
            SELECT 1 FROM pragma_table_info(?)
            WHERE name = ?
          `).get(table.name, idCol);

          if (!idColumnExists) {
            tableResult.errors.push(`Missing ${idCol} column`);
            allColumnsExist = false;
            continue;
          }

          // Check how many rows have the ID set
          const idStats = db.prepare(`
            SELECT
              COUNT(*) as total,
              COUNT(${idCol}) as with_id,
              COUNT(CASE WHEN ${idCol} IS NULL THEN 1 END) as without_id
            FROM ${table.name}
          `).get();

          totalWithId += idStats.with_id;
          totalWithoutId += idStats.without_id;

          // Check for orphaned references
          const orphaned = db.prepare(`
            SELECT COUNT(*) as count
            FROM ${table.name}
            WHERE ${idCol} IS NOT NULL
              AND ${idCol} NOT IN (SELECT id FROM urls)
          `).get().count;

          totalOrphaned += orphaned;

          // Check index coverage for the ID column
          const indexList = db.prepare(`PRAGMA index_list(${table.name})`).all();
          const hasCoveringIndex = indexList.some(index => {
            if (!index.name || index.name.startsWith('sqlite_autoindex')) {
              return false;
            }
            const indexInfo = db.prepare(`PRAGMA index_info(${index.name})`).all();
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
        const columnExists = db.prepare(`
          SELECT 1 FROM pragma_table_info(?)
          WHERE name = ?
        `).get(table.name, urlCol);

        if (columnExists) {
          const urlStats = db.prepare(`
            SELECT
              COUNT(*) as total,
              COUNT(${urlCol}) as with_url,
              COUNT(DISTINCT ${urlCol}) as unique_urls
            FROM ${table.name}
            WHERE ${urlCol} IS NOT NULL
          `).get();

          console.log(`   📊 ${urlCol}: ${urlStats.with_url} non-null values, ${urlStats.unique_urls} unique`);

          if (urlStats.with_url > 0 && !table.idColumn) {
            tableResult.warnings.push(`Still has denormalized ${urlCol} column with ${urlStats.with_url} values`);
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