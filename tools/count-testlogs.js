#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');

const fmt = new CliFormatter();

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

const DEFAULT_TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'count-testlogs',
    'Count and summarize the test log files that Jest reporters generate.'
  );

  parser
    .add('--path <dir>', 'Path to the testlogs directory', DEFAULT_TESTLOGS_DIR)
    .add('--breakdown', 'Include counts per suite', false, 'boolean')
    .add('--verbose', 'List individual files with size and modified time', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII summary and emit JSON only', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(raw) {
  const directoryOption = raw.path || DEFAULT_TESTLOGS_DIR;
  const directory = path.isAbsolute(directoryOption)
    ? directoryOption
    : path.join(process.cwd(), directoryOption);

  const summaryFormat = typeof raw.summaryFormat === 'string'
    ? raw.summaryFormat.trim().toLowerCase()
    : 'ascii';

  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new Error(`Unsupported summary format: ${raw.summaryFormat}`);
  }

  return {
    directory,
    breakdown: Boolean(raw.breakdown),
    verbose: Boolean(raw.verbose),
    quiet: Boolean(raw.quiet),
    summaryFormat
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : value < 10 ? 1 : 0)} ${units[index]}`;
}

function scanTestlogs(directory) {
  if (!fs.existsSync(directory)) {
    return {
      exists: false,
      directory,
      total: 0,
      totalBytes: 0,
      files: [],
      breakdown: {}
    };
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(directory, entry.name);
      const stats = fs.statSync(fullPath);
      return {
        name: entry.name,
        path: fullPath,
        size: stats.size,
        mtime: stats.mtime,
        mtimeMs: stats.mtimeMs
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const breakdown = {};
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;

    const match = file.name.match(/_([a-zA-Z0-9-]+)\./);
    const suite = match ? match[1] : 'unknown';
    if (!breakdown[suite]) {
      breakdown[suite] = {
        count: 0,
        totalBytes: 0,
        newest: null
      };
    }

    const bucket = breakdown[suite];
    bucket.count += 1;
    bucket.totalBytes += file.size;
    if (!bucket.newest || bucket.newest.mtimeMs < file.mtimeMs) {
      bucket.newest = {
        name: file.name,
        size: file.size,
        mtime: file.mtime,
        mtimeMs: file.mtimeMs
      };
    }
  }

  return {
    exists: true,
    directory,
    total: files.length,
    totalBytes,
    files,
    breakdown,
    newestFile: files[0] || null,
    oldestFile: files.length > 0 ? files[files.length - 1] : null
  };
}

function buildJsonPayload(stats, options) {
  const payload = {
    directory: stats.directory,
    exists: stats.exists,
    totalFiles: stats.total,
    totalBytes: stats.totalBytes,
    totalSizeHuman: formatBytes(stats.totalBytes),
    newestFile: stats.newestFile
      ? {
          name: stats.newestFile.name,
          size: stats.newestFile.size,
          modifiedAt: stats.newestFile.mtime.toISOString(),
          sizeHuman: formatBytes(stats.newestFile.size)
        }
      : null,
    oldestFile: stats.oldestFile
      ? {
          name: stats.oldestFile.name,
          size: stats.oldestFile.size,
          modifiedAt: stats.oldestFile.mtime.toISOString(),
          sizeHuman: formatBytes(stats.oldestFile.size)
        }
      : null,
    breakdown: {}
  };

  for (const [suite, info] of Object.entries(stats.breakdown)) {
    payload.breakdown[suite] = {
      count: info.count,
      totalBytes: info.totalBytes,
      totalSizeHuman: formatBytes(info.totalBytes),
      newest:
        info.newest && info.newest.mtime
          ? {
              name: info.newest.name,
              size: info.newest.size,
              modifiedAt: info.newest.mtime.toISOString(),
              sizeHuman: formatBytes(info.newest.size)
            }
          : null
    };
  }

  if (options.verbose) {
    payload.files = stats.files.map((file) => ({
      name: file.name,
      size: file.size,
      sizeHuman: formatBytes(file.size),
      modifiedAt: file.mtime.toISOString()
    }));
  }

  return payload;
}

function emitSummary(stats, options) {
  const payload = buildJsonPayload(stats, options);

  if (options.quiet || options.summaryFormat === 'json') {
    console.log(JSON.stringify(payload, null, options.quiet ? undefined : 2));
    return;
  }

  fmt.header('Test Log Summary');

  if (!stats.exists) {
    fmt.error(`Directory not found: ${stats.directory}`);
    fmt.info('Use --path to point at a different testlogs directory.');
    return;
  }

  fmt.settings(`Directory: ${stats.directory}`);

  fmt.section('Totals');
  fmt.stat('Log files', stats.total, 'number');
  fmt.stat('Combined size', formatBytes(stats.totalBytes));

  if (!stats.total) {
    fmt.info('No test log files found.');
    return;
  }

  if (stats.newestFile) {
    fmt.section('Most Recent');
    fmt.stat('File', stats.newestFile.name);
    fmt.stat('Modified', stats.newestFile.mtime.toISOString());
    fmt.stat('Size', formatBytes(stats.newestFile.size));
  }

  if (options.breakdown) {
    const rows = Object.entries(stats.breakdown)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([suite, info]) => ({
        Suite: suite,
        Files: info.count,
        'Total Size': formatBytes(info.totalBytes),
        'Most Recent': info.newest ? info.newest.mtime.toISOString() : '—'
      }));

    fmt.section('Breakdown by Suite');
    fmt.table(rows, { columns: ['Suite', 'Files', 'Total Size', 'Most Recent'] });
  }

  if (options.verbose) {
    const rows = stats.files.map((file, index) => ({
      '#': index + 1,
      File: file.name,
      Size: formatBytes(file.size),
      Modified: file.mtime.toISOString()
    }));

    fmt.section('Log Files (newest first)');
    fmt.table(rows, { columns: ['#', 'File', 'Size', 'Modified'] });
  }

  fmt.success('Done.');
}

function main() {
  let rawArgs;
  try {
    rawArgs = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }

  let options;
  try {
    options = normalizeOptions(rawArgs);
  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }

  const stats = scanTestlogs(options.directory);

  emitSummary(stats, options);

  if (!stats.exists) {
    process.exit(1);
  }
}

main();
