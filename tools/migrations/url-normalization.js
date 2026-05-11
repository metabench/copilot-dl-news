#!/usr/bin/env node
'use strict';

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const CONFIG = {
  dev: {
    dbPath: path.join(__dirname, '../../data/news.db'),
    verbose: true
  },
  prod: {
    dbPath: path.join(__dirname, '../../data/prod.db'),
    verbose: false
  }
};

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.substring(2);
    if (arg.includes('=')) {
      const [name, value] = key.split('=');
      options[name] = value || true;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      options[key] = argv[i + 1];
      i++;
    } else {
      options[key] = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
URL Normalization Migration Tool

Populates url_id foreign key columns by migrating text URL fields
to normalized references in the urls table.

Usage:
  node tools/migrations/url-normalization.js --env=dev --batch-size=10000
  node tools/migrations/url-normalization.js --env=prod --batch-size=50000
  node tools/migrations/url-normalization.js --env=custom --db=path/to/database.db --limit=100 --table=crawl_jobs

Options:
  --env: dev, prod, or custom
  --db: database path for custom env
  --batch-size: records per transaction, default 1000
  --dry-run: count work without writing changes
  --table: process one table only
  --resume-from: start from a named table
  --resume-offset: resume after a row id
  --limit: maximum records to process
  --max-records: alias for --limit
  --verify: verify each changed batch
  --check-remaining: report remaining work without migrating
  --status: alias for --check-remaining
  --help: show this help
`);
}

function resolveDbPath(options) {
  const env = options.env || 'dev';
  if (env === 'custom') {
    if (!options.db) {
      throw new Error('Custom environment requires --db=path/to/database.db');
    }
    return path.resolve(options.db);
  }
  if (!CONFIG[env]) {
    throw new Error(`Unknown environment: ${env}`);
  }
  return CONFIG[env].dbPath;
}

function getMigrationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.createUrlNormalizationMigrator !== 'function') {
    throw new Error('news-crawler-db does not export createUrlNormalizationMigrator. Build ../news-crawler-db first.');
  }
  if (typeof dbModule.getUrlNormalizationRemainingBatches !== 'function') {
    throw new Error('news-crawler-db does not export getUrlNormalizationRemainingBatches. Build ../news-crawler-db first.');
  }
  return dbModule;
}

function printRemaining(report) {
  console.log('\nRemaining batches');
  console.log('='.repeat(60));
  for (const row of report.tables) {
    if (row.remainingRecords > 0) {
      console.log(`${row.tableName}: ${row.remainingRecords.toLocaleString()} records remaining (${row.remainingBatches} batches of ${report.batchSize})`);
    } else {
      console.log(`${row.tableName}: complete (0 records remaining)`);
    }
  }
  console.log('='.repeat(60));
  console.log(`Total: ${report.totalRemainingRecords.toLocaleString()} records remaining`);
  console.log(`Total: ${report.totalRemainingBatches} batches of ${report.batchSize} remaining\n`);
}

function printSummary(stats, dryRun) {
  const durationMs = Date.now() - stats.startTime;
  const rate = durationMs > 0 ? Math.round(stats.totalProcessed / (durationMs / 1000)) : 0;

  console.log('\n' + '='.repeat(60));
  console.log('Migration summary');
  console.log('='.repeat(60));
  console.log(`Records processed: ${stats.totalProcessed.toLocaleString()}`);
  console.log(`URLs created: ${stats.totalUrlsCreated.toLocaleString()}`);
  console.log(`Errors: ${stats.totalErrors}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s (${rate} records/sec)`);
  if (dryRun) {
    console.log('\nDRY RUN - no changes made');
  }
  console.log('\nFinal progress for resumability:');
  for (const [tableName, progress] of Object.entries(stats.finalProgress)) {
    const status = progress.completed ? 'complete' : 'partial';
    console.log(`  ${tableName}: ${progress.processed.toLocaleString()}/${progress.totalRecords.toLocaleString()} records (${status})`);
    if (!progress.completed) {
      console.log(`    Resume with: --table=${tableName} --resume-offset=${progress.lastId}`);
    }
  }
  console.log('='.repeat(60) + '\n');
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    showHelp();
    return;
  }

  const dbPath = resolveDbPath(options);
  const db = openNewsCrawlerDb(dbPath);
  const api = getMigrationApi();

  try {
    if (options['check-remaining'] || options.status) {
      const report = api.getUrlNormalizationRemainingBatches(db, options);
      printRemaining(report);
      return;
    }

    console.log(`\nURL normalization migration (${options.env || 'dev'}) - ${options['dry-run'] ? 'DRY RUN' : 'LIVE'}\n`);
    console.log(`Database: ${dbPath}`);
    console.log(`Batch size: ${options['batch-size'] || options.batchSize || 1000}`);

    const migrator = api.createUrlNormalizationMigrator(db, {
      ...options,
      onTableStart({ tableName, effectiveTotal, batchSize }) {
        console.log(`\nAnalyzing ${tableName}: ${effectiveTotal.toLocaleString()} records to process in batches of ${batchSize}`);
      },
      onBatch({ tableName, tableProcessed, effectiveTotal, lastProcessedId }) {
        const percent = effectiveTotal > 0 ? ((tableProcessed / effectiveTotal) * 100).toFixed(1) : '100.0';
        console.log(`  ${tableName}: ${percent}% ${tableProcessed.toLocaleString()}/${effectiveTotal.toLocaleString()} last id ${lastProcessedId}`);
      }
    });
    const stats = migrator.run();
    printSummary(stats, Boolean(options['dry-run']));
  } finally {
    await closeDb(db);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  resolveDbPath,
  main
};
