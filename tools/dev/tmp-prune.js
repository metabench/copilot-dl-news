'use strict';

const fs = require('fs');
const path = require('path');

const { CliArgumentParser } = require('../../src/shared/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const DEFAULT_KEEP = 10;
const DEFAULT_SAMPLE_SIZE = 5;
const DEFAULT_STICKY_NAMES = ['.gitkeep'];

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function sortEntriesByTime(entries) {
  return entries.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) {
      return b.mtimeMs - a.mtimeMs;
    }
    if (b.birthtimeMs !== a.birthtimeMs) {
      return b.birthtimeMs - a.birthtimeMs;
    }
    return a.name.localeCompare(b.name);
  });
}

function formatRelative(root, target) {
  const relative = path.relative(root, target);
  return relative === '' ? '.' : relative;
}

async function readDirectoryEntries(dirPath, stats) {
  let dirents;
  try {
    dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    stats.errors.push({
      path: dirPath,
      message: `Failed to read directory: ${error.message}`
    });
    return [];
  }

  const entries = [];
  for (const dirent of dirents) {
    const fullPath = path.join(dirPath, dirent.name);
    let entryStats;
    try {
      entryStats = await fs.promises.stat(fullPath);
    } catch (error) {
      stats.errors.push({
        path: fullPath,
        message: `Failed to stat entry: ${error.message}`
      });
      continue;
    }

    entries.push({
      name: dirent.name,
      path: fullPath,
      dirent,
      mtimeMs: entryStats.mtimeMs,
      birthtimeMs: entryStats.birthtimeMs
    });
  }

  return entries;
}

async function removeEntry(entry, dryRun, stats) {
  if (dryRun) {
    return true;
  }

  try {
    if (entry.dirent.isDirectory()) {
      await fs.promises.rm(entry.path, { recursive: true, force: true });
    } else {
      await fs.promises.rm(entry.path, { force: true });
    }
    return true;
  } catch (error) {
    stats.errors.push({
      path: entry.path,
      message: `Failed to remove entry: ${error.message}`
    });
    return false;
  }
}

async function pruneDirectory(dirPath, options, stats) {
  const entries = await readDirectoryEntries(dirPath, stats);
  stats.directoriesProcessed += 1;
  stats.entriesConsidered += entries.length;

  if (entries.length === 0) {
    stats.directories.push({
      path: dirPath,
      retained: 0,
      removed: 0,
      removedSamples: [],
      retainedSamples: []
    });
    return;
  }

  const stickySet = options.stickyNames;
  const keepBudget = Math.max(0, options.keep);

  const stickyEntries = entries.filter((entry) => stickySet.has(entry.name));
  const otherEntries = entries.filter((entry) => !stickySet.has(entry.name));
  sortEntriesByTime(otherEntries);

  const survivors = stickyEntries.slice();
  for (let i = 0; i < otherEntries.length && survivors.length < stickyEntries.length + keepBudget; i += 1) {
    survivors.push(otherEntries[i]);
  }

  const removalTargets = otherEntries.slice(Math.max(0, keepBudget));

  stats.entriesRetained += survivors.length;
  stats.entriesScheduledForRemoval += removalTargets.length;

  const removedPaths = [];
  let removedCount = 0;
  for (const entry of removalTargets) {
    const removedOk = await removeEntry(entry, options.dryRun, stats);
    if (removedOk) {
      removedCount += 1;
      removedPaths.push(entry.path);
    }
  }
  if (!options.dryRun) {
    stats.entriesRemoved += removedCount;
  }

  const sampleSize = options.sampleSize;
  const retainedSamples = survivors
    .slice(0, sampleSize)
    .map((item) => formatRelative(options.root, item.path));
  const removedSamples = removalTargets
    .slice(0, sampleSize)
    .map((item) => formatRelative(options.root, item.path));

  const record = {
    path: dirPath,
    retained: survivors.length,
    removed: removalTargets.length,
    retainedSamples,
    removedSamples
  };

  if (options.captureDetails) {
    record.retainedPaths = survivors.map((item) => item.path);
    record.removedPaths = removalTargets.map((item) => item.path);
  }

  stats.directories.push(record);

  for (const survivor of survivors) {
    if (survivor.dirent.isDirectory()) {
      await pruneDirectory(survivor.path, options, stats);
    }
  }
}

async function pruneTmp(options = {}) {
  const root = path.resolve(options.root || path.join(process.cwd(), 'tmp'));
  const stats = {
    root,
    keep: Number.isInteger(options.keep) ? options.keep : DEFAULT_KEEP,
    dryRun: options.dryRun !== false,
    directoriesProcessed: 0,
    entriesConsidered: 0,
    entriesRetained: 0,
    entriesScheduledForRemoval: 0,
    entriesRemoved: 0,
    directories: [],
    errors: [],
    missingRoot: false
  };

  const exists = await pathExists(root);
  if (!exists) {
    stats.missingRoot = true;
    return stats;
  }

  const stickyNames = Array.isArray(options.stickyNames) && options.stickyNames.length
    ? new Set(options.stickyNames)
    : new Set(DEFAULT_STICKY_NAMES);

  const internalOptions = {
    root,
    keep: Math.max(0, Number.isInteger(options.keep) ? options.keep : DEFAULT_KEEP),
    dryRun: options.dryRun !== false,
    stickyNames,
    captureDetails: options.captureDetails === true,
    sampleSize: Number.isInteger(options.sampleSize) && options.sampleSize >= 0 ? options.sampleSize : DEFAULT_SAMPLE_SIZE
  };

  await pruneDirectory(root, internalOptions, stats);
  return stats;
}

async function runCli() {
  const parser = new CliArgumentParser('tmp-prune', 'Prune tmp directories while keeping the newest entries', '1.0.0');
  parser
    .add('--root <path>', 'Root directory to prune', path.resolve(process.cwd(), 'tmp'))
    .add('--keep <number>', 'Entries to keep per directory', DEFAULT_KEEP, 'number')
    .add('--fix', 'Apply deletions instead of dry-run', false, 'boolean')
    .add('--json', 'Emit JSON summary output', false, 'boolean')
    .add('--quiet', 'Suppress formatted output', false, 'boolean')
    .add('--lang <code>', 'Output language (en|zh|bilingual)', 'en');

  const args = parser.parse(process.argv);
  const dryRun = args.fix !== true;
  const languageMode = typeof args.lang === 'string' ? args.lang : 'en';

  const stats = await pruneTmp({
    root: args.root,
    keep: Number.isInteger(args.keep) ? args.keep : DEFAULT_KEEP,
    dryRun,
    stickyNames: DEFAULT_STICKY_NAMES,
    captureDetails: false
  });

  if (args.json) {
    console.log(JSON.stringify(stats, null, 2));
    if (stats.errors.length > 0) {
      process.exitCode = 1;
    }
    return stats;
  }

  const formatter = new CliFormatter({ languageMode });

  if (stats.missingRoot) {
    formatter.warn(`Directory not found: ${stats.root}`);
    return stats;
  }

  if (!args.quiet) {
    formatter.header('tmp directory prune');
    formatter.stat('Root', stats.root);
    formatter.stat('Mode', dryRun ? 'preview (dry-run)' : 'delete (fix)');
    formatter.stat('Keep per directory', stats.keep, 'number');
    formatter.stat('Directories processed', stats.directoriesProcessed, 'number');
    formatter.stat('Entries considered', stats.entriesConsidered, 'number');
    formatter.stat('Entries scheduled for removal', stats.entriesScheduledForRemoval, 'number');
    formatter.stat('Entries removed', dryRun ? 0 : stats.entriesRemoved, 'number');

    const directoriesWithRemovals = stats.directories.filter((record) => record.removed > 0);
    if (directoriesWithRemovals.length > 0) {
      formatter.section('Removals');
      const rows = directoriesWithRemovals.slice(0, 10).map((record) => ({
        directory: formatRelative(stats.root, record.path),
        removed: record.removed,
        sample: record.removedSamples.join(', ') || '(none)'
      }));
      formatter.table(rows, {
        columns: ['directory', 'removed', 'sample']
      });
      if (directoriesWithRemovals.length > 10) {
        formatter.info(`Additional directories with removals: ${directoriesWithRemovals.length - 10}`);
      }
    } else {
      formatter.section('Removals');
      formatter.info('No entries qualified for removal.');
    }

    if (stats.errors.length > 0) {
      formatter.section('Errors');
      for (const error of stats.errors) {
        formatter.error(`${error.path}: ${error.message}`);
      }
    } else {
      formatter.success('Prune evaluation complete without errors.');
    }
  }

  if (stats.errors.length > 0) {
    process.exitCode = 1;
  }

  return stats;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  pruneTmp
};

