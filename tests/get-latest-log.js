#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/shared/utils/CliFormatter');
const { CliArgumentParser } = require('../src/shared/utils/CliArgumentParser');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function createParser() {
  const parser = new CliArgumentParser(
    'get-latest-log',
    'Locate the most recent test log without rerunning any tests.'
  );

  parser
    .add('--suite <name>', 'Suite filter (unit, e2e, integration, all)')
    .add('--json', 'Emit JSON output (alias for --summary-format json)', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII output and emit JSON only', false, 'boolean');

  return parser;
}

function normalizeOptions(rawOptions) {
  const positional = Array.isArray(rawOptions.positional) ? rawOptions.positional : [];
  const filteredPositional = positional.filter((value) => {
    if (!value) return false;
    const normalized = value.toString();
    return normalized !== process.argv[0] && normalized !== process.argv[1];
  });

  const suiteFilter = rawOptions.suite || filteredPositional[0] || null;

  let summaryFormat = rawOptions.summaryFormat;
  if (rawOptions.json) {
    summaryFormat = 'json';
  }
  if (typeof summaryFormat === 'string') {
    summaryFormat = summaryFormat.trim().toLowerCase();
  } else {
    summaryFormat = 'ascii';
  }

  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${rawOptions.summaryFormat}`);
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('Quiet mode requires JSON output. Use --json or --summary-format json.');
  }

  return {
    suiteFilter,
    summaryFormat,
    quiet,
  };
}

function ensureTestlogsDirectory() {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    throw new CliError(`Test log directory not found: ${TESTLOGS_DIR}`);
  }
}

function extractSuiteFromFilename(filename) {
  const base = path.basename(filename, '.log');
  const underscoreIndex = base.lastIndexOf('_');
  if (underscoreIndex === -1) return null;
  return base.slice(underscoreIndex + 1) || null;
}

function extractTimestampHint(filename) {
  const base = path.basename(filename, '.log');
  const underscoreIndex = base.indexOf('_');
  if (underscoreIndex === -1) return null;
  const candidate = base.slice(0, underscoreIndex);
  if (/^\d{4}-\d{2}-\d{2}T/.test(candidate)) {
    return candidate;
  }
  return null;
}

function collectLogEntries() {
  ensureTestlogsDirectory();
  const names = fs.readdirSync(TESTLOGS_DIR);

  const entries = [];

  for (const name of names) {
    if (!name.endsWith('.log')) continue;

    const fullPath = path.join(TESTLOGS_DIR, name);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      // Skip files we cannot stat; keep refactor resilient.
      continue;
    }

    entries.push({
      filename: name,
      fullPath,
      suite: extractSuiteFromFilename(name),
      timestampHint: extractTimestampHint(name),
      modifiedMs: stats.mtimeMs,
      modifiedIso: stats.mtime.toISOString(),
      createdIso: stats.birthtime ? stats.birthtime.toISOString() : null,
      sizeBytes: stats.size,
    });
  }

  return entries.sort((a, b) => b.modifiedMs - a.modifiedMs);
}

function filterBySuite(entries, suiteFilter) {
  if (!suiteFilter) return entries;
  const normalized = suiteFilter.toLowerCase();

  const exactMatches = entries.filter((entry) => {
    if (!entry.suite) return false;
    return entry.suite.toLowerCase() === normalized;
  });

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return entries.filter((entry) => entry.filename.toLowerCase().includes(`_${normalized}.log`));
}

function selectLatestEntry(entries, suiteFilter) {
  if (entries.length === 0) {
    throw new CliError('No test logs found. Run the test suite to generate logs.');
  }

  const filtered = filterBySuite(entries, suiteFilter);
  if (filtered.length === 0) {
    if (suiteFilter) {
      throw new CliError(`No test logs found for suite: ${suiteFilter}`);
    }
    throw new CliError('No test logs found.');
  }

  return filtered[0];
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown';
  }

  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[exponent]}`;
}

function renderAscii(entry, options) {
  fmt.header('Latest Test Log');
  fmt.settings(`Directory: ${TESTLOGS_DIR}`);
  if (options.suiteFilter) {
    fmt.settings(`Suite filter: ${options.suiteFilter}`);
  }

  fmt.summary({
    'Suite': entry.suite || 'unknown',
    'Filename': entry.filename,
    'Modified': entry.modifiedIso,
    'Size': formatBytes(entry.sizeBytes),
  });

  if (entry.timestampHint) {
    fmt.info(`Filename timestamp hint: ${entry.timestampHint}`);
  }

  fmt.section('Path');
  fmt.list('Log location', [entry.fullPath]);

  if (entry.createdIso && entry.createdIso !== entry.modifiedIso) {
    fmt.info(`Created at ${entry.createdIso}`);
  }

  fmt.footer();
}

function buildJson(entry, options) {
  return {
    suite: entry.suite || null,
    filename: entry.filename,
    path: entry.fullPath,
    directory: TESTLOGS_DIR,
    timestampHint: entry.timestampHint,
    modifiedIso: entry.modifiedIso,
    createdIso: entry.createdIso,
    sizeBytes: entry.sizeBytes,
    sizeHuman: formatBytes(entry.sizeBytes),
    suiteFilter: options.suiteFilter || null,
  };
}

function emitResult(entry, options) {
  if (options.summaryFormat === 'json') {
    const indent = options.quiet ? undefined : 2;
    console.log(JSON.stringify(buildJson(entry, options), null, indent));
    return;
  }

  renderAscii(entry, options);
}

function main() {
  const parser = createParser();
  let rawArgs;

  try {
    rawArgs = parser.parse(process.argv);
  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }

  let options;
  try {
    options = normalizeOptions(rawArgs);
  } catch (error) {
    if (error instanceof CliError) {
      fmt.error(error.message);
      process.exit(error.exitCode);
    }
    fmt.error(error.message);
    process.exit(1);
  }

  try {
    const entries = collectLogEntries();
    const latest = selectLatestEntry(entries, options.suiteFilter);
    emitResult(latest, options);
    process.exit(0);
  } catch (error) {
    if (error instanceof CliError) {
      fmt.error(error.message);
      process.exit(error.exitCode);
    }
    fmt.error(error.message);
    if (process.env.DEBUG_CLI === '1') {
      console.error(error);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    TESTLOGS_DIR,
    collectLogEntries,
    filterBySuite,
    buildLatestLogJson: buildJson,
    findLatestLogEntry(suiteFilter = null) {
      const entries = collectLogEntries();
      return selectLatestEntry(entries, suiteFilter);
    },
  };
}
