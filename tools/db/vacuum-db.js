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
const { CliFormatter } = require('../src/shared/utils/CliFormatter');
const { CliArgumentParser } = require('../src/shared/utils/CliArgumentParser');
const { openDatabase } = require('../src/data/db/sqlite/v1');
const { vacuumDatabase } = require('../src/data/db/sqlite/v1/queries/maintenance');
const { findProjectRoot } = require('../src/shared/utils/project-root');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();
const projectRoot = findProjectRoot(__dirname);
const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'news.db');

function createParser() {
  const parser = new CliArgumentParser(
    'vacuum-db',
    'Run VACUUM against the SQLite database to reclaim unused space.'
  );

  parser
    .add('--db <path>', 'Path to SQLite database file', DEFAULT_DB_PATH)
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--json', 'Shortcut for --summary-format json', false, 'boolean')
    .add('--quiet', 'Suppress ASCII summary when emitting JSON', false, 'boolean');

  return parser;
}

function resolveDatabasePath(overriddenPath) {
  const candidate = overriddenPath ? path.resolve(overriddenPath) : DEFAULT_DB_PATH;
  if (!fs.existsSync(candidate)) {
    throw new CliError(`Database not found at ${candidate}. Use --db to provide a valid path.`);
  }
  return candidate;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) {
    return '0 B';
  }
  if (value === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / Math.pow(1024, exponent);
  const precision = scaled >= 100 || exponent === 0 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[exponent]}`;
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) {
    return '0 ms';
  }
  if (value < 1000) {
    return `${value.toFixed(0)} ms`;
  }
  if (value < 60_000) {
    return `${(value / 1000).toFixed(2)} s`;
  }
  const minutes = Math.floor(value / 60_000);
  const seconds = ((value % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function getFileSizeBytes(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    throw new CliError(`Unable to read file size for ${filePath}: ${error.message}`);
  }
}

function normalizeOptions(rawOptions) {
  const normalizedFormat = rawOptions.json ? 'json' : (rawOptions.summaryFormat || 'ascii');
  const summaryFormat = normalizedFormat.toLowerCase();
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError('Unsupported summary format. Choose between ascii or json.');
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('--quiet can only be used when --summary-format json is active.');
  }

  const dbPath = resolveDatabasePath(rawOptions.db);

  return {
    dbPath,
    summaryFormat,
    quiet
  };
}

function runVacuum(dbPath) {
  const sizeBefore = getFileSizeBytes(dbPath);
  const startedAt = process.hrtime.bigint();

  const db = openDatabase(dbPath, { fileMustExist: true });
  try {
    vacuumDatabase(db);
  } finally {
    db.close();
  }

  const finishedAt = process.hrtime.bigint();
  const sizeAfter = getFileSizeBytes(dbPath);

  const bytesReclaimed = Math.max(0, sizeBefore - sizeAfter);
  const percentReclaimed = sizeBefore > 0 ? (bytesReclaimed / sizeBefore) * 100 : 0;
  const durationMs = Number(finishedAt - startedAt) / 1_000_000;

  return {
    dbPath,
    sizeBeforeBytes: sizeBefore,
    sizeAfterBytes: sizeAfter,
    bytesReclaimed,
    percentReclaimed,
    durationMs,
    savingsDetected: bytesReclaimed > 0
  };
}

function renderAscii(summary) {
  fmt.header('Vacuum SQLite Database');
  fmt.settings(`Database: ${summary.dbPath}`);

  fmt.section('Before Vacuum');
  fmt.stat('Size', formatBytes(summary.sizeBeforeBytes));

  fmt.section('After Vacuum');
  fmt.stat('Size', formatBytes(summary.sizeAfterBytes));
  fmt.stat('Space reclaimed', formatBytes(summary.bytesReclaimed));
  fmt.stat('Percent reclaimed', `${summary.percentReclaimed.toFixed(2)}%`);
  fmt.stat('Elapsed', formatDuration(summary.durationMs));

  if (summary.savingsDetected) {
    fmt.success('Database vacuum completed and reclaimed space.');
  } else {
    fmt.info('Database already optimized — no space reclaimed.');
  }
}

function emitJson(summary, options) {
  const payload = {
    databasePath: summary.dbPath,
    sizeBeforeBytes: summary.sizeBeforeBytes,
    sizeBeforeFormatted: formatBytes(summary.sizeBeforeBytes),
    sizeAfterBytes: summary.sizeAfterBytes,
    sizeAfterFormatted: formatBytes(summary.sizeAfterBytes),
    bytesReclaimed: summary.bytesReclaimed,
    bytesReclaimedFormatted: formatBytes(summary.bytesReclaimed),
    percentReclaimed: Number(summary.percentReclaimed.toFixed(2)),
    vacuumDurationMs: Number(summary.durationMs.toFixed(2)),
    vacuumDurationFormatted: formatDuration(summary.durationMs),
    savingsDetected: summary.savingsDetected,
    executedAt: new Date().toISOString()
  };

  const spacing = options.quiet ? undefined : 2;
  console.log(JSON.stringify(payload, null, spacing));
}

function main(argv = process.argv) {
  let rawOptions;
  try {
    const parser = createParser();
    rawOptions = parser.parse(argv);
  } catch (error) {
    fmt.error(error?.message || 'Failed to parse arguments.');
    process.exit(1);
  }

  let options;
  try {
    options = normalizeOptions(rawOptions);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    fmt.error(error.message || 'Invalid configuration.');
    process.exit(exitCode);
  }

  let summary;
  try {
    summary = runVacuum(options.dbPath);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    fmt.error(error.message || 'Vacuum operation failed.');
    process.exit(exitCode);
  }

  const asciiEnabled = options.summaryFormat !== 'json' || !options.quiet;
  const jsonEnabled = options.summaryFormat === 'json';

  if (asciiEnabled) {
    renderAscii(summary);
  }

  if (jsonEnabled) {
    emitJson(summary, options);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  createParser,
  normalizeOptions,
  formatBytes,
  formatDuration,
  runVacuum
};