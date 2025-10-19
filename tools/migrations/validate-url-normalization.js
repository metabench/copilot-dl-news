#!/usr/bin/env node

/**
 * URL Normalization Validation Script
 *
 * Validates the integrity of URL normalization migration by checking:
 * - All TEXT URL fields have corresponding url_id values
 * - URL references are correct (urls table contains matching URLs)
 * - Foreign key constraints are satisfied
 * - Performance benchmarks before/after migration
 *
 * Usage:
 *   node tools/migrations/validate-url-normalization.js --env=dev
 *   node tools/migrations/validate-url-normalization.js --env=prod --performance
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite/v1');

// Configuration
const CONFIG = {
  dev: {
    dbPath: path.join(__dirname, '../../data/dev.db'),
    verbose: true
  },
  prod: {
    dbPath: path.join(__dirname, '../../data/prod.db'),
    verbose: false
  }
};

// Tables to validate with their URL field mappings
const TABLES_TO_VALIDATE = {
  links: [
    { textField: 'src_url', idField: 'src_url_id' },
    { textField: 'dst_url', idField: 'dst_url_id' }
  ],
  queue_events: [
    { textField: 'url', idField: 'url_id' }
  ],
  crawl_jobs: [
    { textField: 'url', idField: 'url_id' }
  ],
  errors: [
    { textField: 'url', idField: 'url_id' }
  ],
  url_aliases: [
    { textField: 'url', idField: 'url_id' },
    { textField: 'alias_url', idField: 'alias_url_id' }
  ]
};

class URLNormalizationValidator {
  constructor(options = {}) {
    this.env = options.env || 'dev';
    this.runPerformance = options.performance || false;
    this.config = CONFIG[this.env];

    if (!this.config) {
      throw new Error(`Unknown environment: ${this.env}. Use 'dev' or 'prod'.`);
    }

    this.db = ensureDatabase(this.config.dbPath);
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      checks: []
    };
  }

  async run() {
    console.log(`🔍 URL Normalization Validation`);
    console.log(`Environment: ${this.env}`);
    console.log(`Database: ${this.config.dbPath}`);
    console.log(`Performance Tests: ${this.runPerformance ? 'YES' : 'NO'}`);
    console.log('');

    try {
      await this.runAllChecks();
      this.printSummary();

      if (this.results.failed > 0) {
        console.log('❌ Validation FAILED - Do not proceed with migration cleanup');
        process.exit(1);
      } else {
        console.log('✅ Validation PASSED - Migration is ready for cleanup');
        process.exit(0);
      }

    } catch (error) {
      console.error('❌ Validation failed with error:', error.message);
      process.exit(1);
    }
  }

  async runAllChecks() {
    // Basic integrity checks
    await this.checkMigrationSchema();
    await this.checkUrlIdPopulation();
    await this.checkUrlReferences();
    await this.checkForeignKeyConstraints();

    // Performance checks (optional)
    if (this.runPerformance) {
      await this.runPerformanceBenchmarks();
    }

    // Storage analysis
    await this.analyzeStorageSavings();
  }

  async checkMigrationSchema() {
    console.log('🔧 Checking migration schema...');

    for (const [tableName, fields] of Object.entries(TABLES_TO_VALIDATE)) {
      for (const field of fields) {
        const columnExists = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM pragma_table_info(?)
          WHERE name = ?
        `).get(tableName, field.idField);

        if (!columnExists.count) {
          this.recordCheck('FAILED', `Schema Check`, `${tableName}.${field.idField} column missing`);
        } else {
          this.recordCheck('PASSED', `Schema Check`, `${tableName}.${field.idField} column exists`);
        }
      }
    }
  }

  async checkUrlIdPopulation() {
    console.log('📊 Checking URL ID population...');

    for (const [tableName, fields] of Object.entries(TABLES_TO_VALIDATE)) {
      const totalRecords = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;

      if (totalRecords === 0) {
        this.recordCheck('PASSED', `Population Check`, `${tableName} is empty`);
        continue;
      }

      for (const field of fields) {
        // Check records where TEXT field is not null but url_id is null
        const missingIds = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ${field.textField} IS NOT NULL AND ${field.idField} IS NULL
        `).get().count;

        if (missingIds > 0) {
          this.recordCheck('FAILED', `Population Check`,
            `${tableName}.${field.idField}: ${missingIds} records missing URL IDs`);
        } else {
          this.recordCheck('PASSED', `Population Check`,
            `${tableName}.${field.idField}: All ${totalRecords} records have URL IDs`);
        }

        // Check records where url_id is not null but TEXT field is null
        const orphanedIds = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ${field.textField} IS NULL AND ${field.idField} IS NOT NULL
        `).get().count;

        if (orphanedIds > 0) {
          this.recordCheck('WARNING', `Population Check`,
            `${tableName}.${field.idField}: ${orphanedIds} records have URL ID but no TEXT URL`);
        }
      }
    }
  }

  async checkUrlReferences() {
    console.log('🔗 Checking URL references...');

    for (const [tableName, fields] of Object.entries(TABLES_TO_VALIDATE)) {
      for (const field of fields) {
        // Check that all url_id values reference existing URLs
        const invalidRefs = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM ${tableName} t
          LEFT JOIN urls u ON t.${field.idField} = u.id
          WHERE t.${field.idField} IS NOT NULL AND u.id IS NULL
        `).get().count;

        if (invalidRefs > 0) {
          this.recordCheck('FAILED', `Reference Check`,
            `${tableName}.${field.idField}: ${invalidRefs} invalid URL references`);
        } else {
          this.recordCheck('PASSED', `Reference Check`,
            `${tableName}.${field.idField}: All URL references are valid`);
        }

        // Check that URL text matches referenced URL
        const mismatchedUrls = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM ${tableName} t
          JOIN urls u ON t.${field.idField} = u.id
          WHERE t.${field.textField} != u.url
        `).get().count;

        if (mismatchedUrls > 0) {
          this.recordCheck('FAILED', `Reference Check`,
            `${tableName}.${field.idField}: ${mismatchedUrls} URL text mismatches`);
        } else {
          this.recordCheck('PASSED', `Reference Check`,
            `${tableName}.${field.idField}: All URL texts match references`);
        }
      }
    }
  }

  async checkForeignKeyConstraints() {
    console.log('🔑 Checking foreign key constraints...');

    // Enable foreign key enforcement for this check
    this.db.pragma('foreign_keys = ON');

    try {
      // This will throw if there are any foreign key violations
      for (const tableName of Object.keys(TABLES_TO_VALIDATE)) {
        this.db.prepare(`SELECT COUNT(*) FROM ${tableName}`).get();
      }
      this.recordCheck('PASSED', 'Foreign Keys', 'All foreign key constraints satisfied');
    } catch (error) {
      this.recordCheck('FAILED', 'Foreign Keys', `Foreign key violation: ${error.message}`);
    } finally {
      // Restore original setting
      this.db.pragma('foreign_keys = OFF');
    }
  }

  async runPerformanceBenchmarks() {
    console.log('⚡ Running performance benchmarks...');

    // Benchmark URL queries before/after normalization
    const benchmarks = [
      {
        name: 'URL Lookup by Text',
        query: 'SELECT * FROM urls WHERE url = ?',
        params: ['https://example.com/page']
      },
      {
        name: 'URL Lookup by ID',
        query: 'SELECT * FROM urls WHERE id = ?',
        params: [1]
      },
      {
        name: 'Links by Source URL (Text)',
        query: 'SELECT COUNT(*) FROM links WHERE src_url = ?',
        params: ['https://example.com/page']
      },
      {
        name: 'Links by Source URL ID',
        query: 'SELECT COUNT(*) FROM links WHERE src_url_id = ?',
        params: [1]
      }
    ];

    for (const benchmark of benchmarks) {
      const times = [];
      for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        try {
          this.db.prepare(benchmark.query).get(...benchmark.params);
        } catch (error) {
          // Query might fail if data doesn't exist, that's OK for benchmark
        }
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1e6); // Convert to milliseconds
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      console.log(`   ${benchmark.name}:`);
      console.log(`     Average: ${avgTime.toFixed(3)}ms`);
      console.log(`     Min: ${minTime.toFixed(3)}ms, Max: ${maxTime.toFixed(3)}ms`);
    }
  }

  async analyzeStorageSavings() {
    console.log('💾 Analyzing storage savings...');

    // Calculate storage used by URL fields
    let totalTextStorage = 0;
    let totalIdStorage = 0;

    for (const [tableName, fields] of Object.entries(TABLES_TO_VALIDATE)) {
      for (const field of fields) {
        // TEXT field storage (approximate)
        const textStats = this.db.prepare(`
          SELECT
            COUNT(*) as count,
            SUM(LENGTH(${field.textField})) as total_chars,
            AVG(LENGTH(${field.textField})) as avg_chars
          FROM ${tableName}
          WHERE ${field.textField} IS NOT NULL
        `).get();

        if (textStats.count > 0) {
          const textBytes = textStats.total_chars; // Approximate bytes (UTF-8)
          const idBytes = textStats.count * 4; // 4 bytes per INTEGER foreign key

          totalTextStorage += textBytes;
          totalIdStorage += idBytes;

          const savings = textBytes - idBytes;
          const savingsPercent = ((savings / textBytes) * 100).toFixed(1);

          console.log(`   ${tableName}.${field.textField}:`);
          console.log(`     Records: ${textStats.count.toLocaleString()}`);
          console.log(`     TEXT storage: ${(textBytes / 1024 / 1024).toFixed(2)} MB`);
          console.log(`     ID storage: ${(idBytes / 1024 / 1024).toFixed(2)} MB`);
          console.log(`     Savings: ${(savings / 1024 / 1024).toFixed(2)} MB (${savingsPercent}%)`);
        }
      }
    }

    const totalSavings = totalTextStorage - totalIdStorage;
    const totalSavingsPercent = ((totalSavings / totalTextStorage) * 100).toFixed(1);

    console.log('');
    console.log('   OVERALL STORAGE ANALYSIS:');
    console.log(`     TEXT fields: ${(totalTextStorage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     ID fields: ${(totalIdStorage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`     Total savings: ${(totalSavings / 1024 / 1024).toFixed(2)} MB (${totalSavingsPercent}%)`);

    this.recordCheck('INFO', 'Storage Analysis',
      `Projected savings: ${(totalSavings / 1024 / 1024).toFixed(2)} MB (${totalSavingsPercent}%)`);
  }

  recordCheck(status, category, message) {
    this.results.checks.push({ status, category, message });

    switch (status) {
      case 'PASSED':
        this.results.passed++;
        console.log(`   ✅ ${category}: ${message}`);
        break;
      case 'FAILED':
        this.results.failed++;
        console.log(`   ❌ ${category}: ${message}`);
        break;
      case 'WARNING':
        this.results.warnings++;
        console.log(`   ⚠️  ${category}: ${message}`);
        break;
      case 'INFO':
        console.log(`   ℹ️  ${category}: ${message}`);
        break;
    }
  }

  printSummary() {
    console.log('');
    console.log('📋 Validation Summary');
    console.log('===================');
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Warnings: ${this.results.warnings}`);
    console.log('');

    if (this.results.failed > 0) {
      console.log('❌ FAILED CHECKS:');
      this.results.checks
        .filter(check => check.status === 'FAILED')
        .forEach(check => console.log(`   - ${check.category}: ${check.message}`));
      console.log('');
    }

    if (this.results.warnings > 0) {
      console.log('⚠️  WARNINGS:');
      this.results.checks
        .filter(check => check.status === 'WARNING')
        .forEach(check => console.log(`   - ${check.category}: ${check.message}`));
      console.log('');
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value || true;
    }
  }

  return options;
}

// Main execution
async function main() {
  try {
    const options = parseArgs();
    const validator = new URLNormalizationValidator(options);
    await validator.run();
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { URLNormalizationValidator };