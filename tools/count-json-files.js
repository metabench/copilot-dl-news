#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const { sortDirectoriesByCount, renderDirectoryTable } = require('./lib/json-count-table');

const fmt = new CliFormatter();

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') {
        process.exit(0);
      }
    });
  }
} catch (_) {}

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'count-json-files',
    'Count the JSON files contained directly within each directory under a root path.'
  );

  parser
    .add('--root <path>', 'Root directory to scan (default: current working directory)', process.cwd())
    .add('--summary-format <mode>', 'Summary output format: ascii | json | table', 'ascii')
    .add('--json', 'Shortcut for --summary-format json', false, 'boolean')
    .add('--table', 'Shortcut for --summary-format table', false, 'boolean')
    .add('--quiet', 'Suppress ASCII/table output and emit JSON only', false, 'boolean')
    .add('--limit <number>', 'Number of directories to display in summaries (0 = all)', 0, 'int');

  return parser.parse(argv);
}

function normalizeOptions(raw) {
  let summaryFormatRaw = raw.summaryFormat;
  if (!summaryFormatRaw) {
    if (raw.json) {
      summaryFormatRaw = 'json';
    } else if (raw.table) {
      summaryFormatRaw = 'table';
    } else {
      summaryFormatRaw = 'ascii';
    }
  }

  const summaryFormat = typeof summaryFormatRaw === 'string'
    ? summaryFormatRaw.trim().toLowerCase()
    : 'ascii';

  if (!['ascii', 'json', 'table'].includes(summaryFormat)) {
    throw new Error(`Unsupported summary format: ${raw.summaryFormat || summaryFormatRaw}`);
  }

  const rootOption = raw.root || process.cwd();
  const root = path.isAbsolute(rootOption)
    ? rootOption
    : path.resolve(process.cwd(), rootOption);

  const quiet = Boolean(raw.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new Error('Quiet mode requires --summary-format json (or the --json flag).');
  }

  const limit = Number.isInteger(raw.limit) ? raw.limit : 0;
  if (limit < 0) {
    throw new Error('Limit must be zero or a positive integer value.');
  }

  return {
    root,
    summaryFormat,
    quiet,
    limit
  };
}

function collectJsonDirectoryStats(root) {
  const stats = {
    root,
    exists: false,
    directories: [],
    totalJsonFiles: 0,
    totalBytes: 0,
    traversalErrors: [],
    directoriesScanned: 0
  };

  let rootStats;
  try {
    rootStats = fs.statSync(root);
  } catch (error) {
    stats.traversalErrors.push({ directory: root, message: error.message });
    return stats;
  }

  if (!rootStats.isDirectory()) {
    stats.traversalErrors.push({ directory: root, message: 'Path is not a directory.' });
    return stats;
  }

  stats.exists = true;

  function traverseDirectory(current) {
    stats.directoriesScanned += 1;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      stats.traversalErrors.push({ directory: current, message: error.message });
      return { jsonFiles: 0, bytes: 0 };
    }

    let directJsonFiles = 0;
    let totalJsonFiles = 0;
    let totalBytes = 0;

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        const sub = traverseDirectory(fullPath);
        totalJsonFiles += sub.jsonFiles;
        totalBytes += sub.bytes;
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        directJsonFiles += 1;
        try {
          const fileStats = fs.statSync(fullPath);
          totalBytes += fileStats.size;
        } catch (error) {
          // If can't stat, still count the file but don't add bytes
        }
      }
    }

    totalJsonFiles += directJsonFiles;

    if (totalJsonFiles > 0) {
      const relativePathRaw = path.relative(root, current);
      const relativePath = relativePathRaw === '' ? '.' : relativePathRaw;

      stats.directories.push({
        absolutePath: current,
        relativePath,
        totalJsonFiles,
        directJsonFiles,
        totalBytes,
        jsonFiles: totalJsonFiles
      });
    }

    return { jsonFiles: totalJsonFiles, bytes: totalBytes };
  }

  const rootResult = traverseDirectory(root);
  stats.totalJsonFiles = rootResult.jsonFiles;
  stats.totalBytes = rootResult.bytes;
  return stats;
}
function buildJsonPayload(stats, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : undefined;
  const sortedDirectories = sortDirectoriesByCount(stats.directories);
  const limitedDirectories = limit ? sortedDirectories.slice(0, limit) : sortedDirectories;
  const truncatedCount = sortedDirectories.length - limitedDirectories.length;

  return {
    root: stats.root,
    exists: stats.exists,
    totalJsonFiles: stats.totalJsonFiles,
    totalBytes: stats.totalBytes,
    directoriesWithJson: stats.directories.length,
    directoriesScanned: stats.directoriesScanned,
    countsIncludeSubdirectories: true,
    directoryLimit: limit,
    directoriesReturned: limitedDirectories.length,
    directoriesTruncated: truncatedCount > 0 ? truncatedCount : 0,
    directories: limitedDirectories.map((dir) => ({
      relativePath: dir.relativePath,
      absolutePath: dir.absolutePath,
      totalJsonFiles: typeof dir.totalJsonFiles === 'number' ? dir.totalJsonFiles : dir.jsonFiles,
      totalBytes: dir.totalBytes,
      directJsonFiles: typeof dir.directJsonFiles === 'number' ? dir.directJsonFiles : undefined,
      jsonFiles: typeof dir.totalJsonFiles === 'number' ? dir.totalJsonFiles : dir.jsonFiles
    })),
    traversalErrors: stats.traversalErrors.map((error) => ({
      directory: error.directory,
      message: error.message
    }))
  };
}

function logTraversalErrors(errors, writer) {
  if (!errors || errors.length === 0) {
    return;
  }

  const write = typeof writer === 'function' ? writer : (message) => fmt.warn(message);
  for (const error of errors) {
    write(`${error.directory}: ${error.message}`);
  }
}

function emitAsciiSummary(stats, options = {}) {
  fmt.header('JSON File Counts');
  fmt.settings(`Root: ${stats.root}`);

  if (!stats.exists) {
    fmt.error('Root path does not exist or is not a directory.');
    if (stats.traversalErrors.length > 0) {
      fmt.section('Errors');
      logTraversalErrors(stats.traversalErrors, (message) => fmt.error(message));
    }
    fmt.footer();
    return;
  }

  if (stats.directories.length === 0) {
    fmt.info('No JSON files found under the specified root.');
  } else {
    fmt.section('Directories Containing JSON Files');
    const table = renderDirectoryTable(fmt, stats.directories, { limit: options.limit, includeSize: true, format: { Size: formatBytes } });
    if (table.limitApplied) {
      const hidden = table.totalDirectories - table.displayedDirectories;
      fmt.info(`Showing top ${table.displayedDirectories} of ${table.totalDirectories} directories with JSON files (limit ${table.limit}). ${hidden} additional directories hidden.`);
    }
    fmt.info('Totals include JSON files within each directory and all nested subdirectories.');
  }

  fmt.summary({
    'Directories with JSON': stats.directories.length,
    'Total JSON files': stats.totalJsonFiles,
    'Total size': formatBytes(stats.totalBytes),
    'Directories scanned': stats.directoriesScanned,
    'Traversal errors': stats.traversalErrors.length
  });

  if (stats.traversalErrors.length > 0) {
    fmt.section('Traversal Errors');
    logTraversalErrors(stats.traversalErrors);
  }

  fmt.footer();
}

function emitTableSummary(stats, options = {}) {
  fmt.header('JSON File Counts (Table)');
  fmt.settings(`Root: ${stats.root}`);

  if (!stats.exists) {
    fmt.error('Root path does not exist or is not a directory.');
    if (stats.traversalErrors.length > 0) {
      fmt.section('Errors');
      logTraversalErrors(stats.traversalErrors, (message) => fmt.error(message));
    }
    fmt.footer();
    return;
  }

  if (stats.directories.length === 0) {
    fmt.info('No JSON files found under the specified root.');
    fmt.footer();
    return;
  }

  fmt.section('Directories Containing JSON Files');
  const table = renderDirectoryTable(fmt, stats.directories, { limit: options.limit, includeSize: true, format: { Size: formatBytes } });
  if (table.limitApplied) {
    const hidden = table.totalDirectories - table.displayedDirectories;
    fmt.info(`Showing top ${table.displayedDirectories} of ${table.totalDirectories} directories with JSON files (limit ${table.limit}). ${hidden} additional directories hidden.`);
  }
  fmt.info('Totals include JSON files within each directory and all nested subdirectories.');

  fmt.summary({
    'Directories with JSON': stats.directories.length,
    'Total JSON files': stats.totalJsonFiles,
    'Total size': formatBytes(stats.totalBytes),
    'Directories scanned': stats.directoriesScanned,
    'Traversal errors': stats.traversalErrors.length
  });

  if (stats.traversalErrors.length > 0) {
    fmt.section('Traversal Errors');
    logTraversalErrors(stats.traversalErrors);
  }

  fmt.footer();
}

function emitSummary(stats, options) {
  if (options.summaryFormat === 'json') {
    const payload = buildJsonPayload(stats, options);
    console.log(JSON.stringify(payload, null, options.quiet ? undefined : 2));
    return;
  }

  if (options.summaryFormat === 'table') {
    emitTableSummary(stats, options);
    return;
  }

  emitAsciiSummary(stats, options);
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

  const stats = collectJsonDirectoryStats(options.root);
  emitSummary(stats, options);

  if (!stats.exists || stats.traversalErrors.length > 0) {
    process.exit(stats.exists ? 1 : 2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectJsonDirectoryStats
};
