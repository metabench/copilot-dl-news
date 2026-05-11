#!/usr/bin/env node
'use strict';

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

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

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.substring(2).split('=');
    options[key] = value || true;
  }
  return options;
}

function resolveDbPath(options) {
  const env = options.env || 'dev';
  if (options.db) return path.resolve(options.db);
  if (!CONFIG[env]) {
    throw new Error(`Unknown environment: ${env}. Use dev, prod, or --db=path.`);
  }
  return CONFIG[env].dbPath;
}

function getValidationApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.runUrlNormalizationValidation !== 'function') {
    throw new Error('news-crawler-db does not export runUrlNormalizationValidation. Build ../news-crawler-db first.');
  }
  return dbModule;
}

function printCheck(check) {
  const label = check.status.padEnd(7);
  console.log(`  ${label} ${check.category}: ${check.message}`);
}

function printSummary(results) {
  for (const check of results.checks) {
    printCheck(check);
  }

  if (results.benchmarks.length > 0) {
    console.log('\nPerformance benchmarks:');
    for (const benchmark of results.benchmarks) {
      console.log(`  ${benchmark.name}: avg ${benchmark.averageMs.toFixed(3)}ms, min ${benchmark.minMs.toFixed(3)}ms, max ${benchmark.maxMs.toFixed(3)}ms`);
    }
  }

  if (results.storage) {
    const storage = results.storage;
    console.log('\nStorage analysis:');
    console.log(`  Text fields: ${(storage.totalTextStorage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ID fields: ${(storage.totalIdStorage / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Projected savings: ${(storage.totalSavings / 1024 / 1024).toFixed(2)} MB (${storage.totalSavingsPercent.toFixed(1)}%)`);
  }

  console.log('\nValidation summary');
  console.log('='.repeat(60));
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Warnings: ${results.warnings}`);
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const options = parseArgs();
  const dbPath = resolveDbPath(options);
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  const api = getValidationApi();

  try {
    console.log('URL normalization validation');
    console.log(`Environment: ${options.env || 'dev'}`);
    console.log(`Database: ${dbPath}`);
    console.log(`Performance tests: ${options.performance ? 'YES' : 'NO'}\n`);

    const results = api.runUrlNormalizationValidation(db, { performance: Boolean(options.performance) });
    printSummary(results);

    if (results.failed > 0) {
      console.log('\nValidation failed - do not proceed with cleanup');
      process.exitCode = 1;
    } else {
      console.log('\nValidation passed');
    }
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
