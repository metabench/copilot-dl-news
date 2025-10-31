#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync, execSync } = require('child_process');
const { Worker } = require('worker_threads');
const extract = require('extract-zip');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const { openDatabase } = require('../src/db/sqlite/v1');
const { findProjectRoot } = require('../src/utils/project-root');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();
const projectRoot = findProjectRoot(__dirname);
const DEFAULT_DB_PATH = path.join(projectRoot, 'data', 'news.db');
const SQLITE_DOWNLOAD_URL = 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460000.zip';
const SQLITE_EXECUTABLE = process.platform === 'win32' ? 'sqlite3.exe' : 'sqlite3';

function createParser() {
  const parser = new CliArgumentParser(
    'db-table-sizes',
    'Inspect SQLite table sizes using dbstat with formatter-friendly output.'
  );

  parser
    .add('--db <path>', 'Path to SQLite database', DEFAULT_DB_PATH)
    .add('--mode <mode>', 'Analysis mode: auto | cli | worker | size', 'auto')
    .add('--limit <number>', 'Number of tables to display (0 = all)', 20, 'int')
    .add('--no-download', 'Skip automatic sqlite3 CLI downloads', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--json', 'Shortcut for --summary-format json', false, 'boolean')
    .add('--quiet', 'Suppress ASCII summary when emitting JSON', false, 'boolean');

  return parser;
}

function resolveDatabasePath(inputPath) {
  const candidate = inputPath ? path.resolve(inputPath) : DEFAULT_DB_PATH;
  if (!fs.existsSync(candidate)) {
    throw new CliError(`Database not found at ${candidate}. Use --db to provide a valid path.`);
  }
  return candidate;
}

function normalizeOptions(rawOptions) {
  const summaryFormat = (rawOptions.json ? 'json' : rawOptions.summaryFormat || 'ascii').toLowerCase();
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError('Unsupported summary format. Choose ascii or json.');
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('--quiet can only be used with --summary-format json.');
  }

  const mode = (rawOptions.mode || 'auto').toLowerCase();
  const allowedModes = new Set(['auto', 'cli', 'worker', 'size']);
  if (!allowedModes.has(mode)) {
    throw new CliError('Unsupported mode. Use auto, cli, worker, or size.');
  }

  const limit = rawOptions.limit != null ? rawOptions.limit : 20;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new CliError('--limit must be a non-negative integer.');
  }

  const dbPath = resolveDatabasePath(rawOptions.db);

  return {
    dbPath,
    mode,
    limit,
    allowDownload: !rawOptions.noDownload,
    summaryFormat,
    quiet
  };
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
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

function getFileSizeBytes(dbPath) {
  try {
    return fs.statSync(dbPath).size;
  } catch (error) {
    throw new CliError(`Unable to read database file size: ${error.message}`);
  }
}

function collectWithDbstat(dbPath) {
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(`
      SELECT 
        name,
        COUNT(*) AS page_count,
        SUM(pgsize) AS size_bytes
      FROM dbstat
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY name
      ORDER BY size_bytes DESC
    `).all();

    return rows.map((row) => ({
      name: row.name,
      pageCount: Number(row.page_count || 0),
      sizeBytes: Number(row.size_bytes || 0)
    }));
  } finally {
    db.close();
  }
}

function parseCliOutput(rawOutput) {
  const lines = rawOutput.trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const [name, pageCount, sizeBytes] = line.split(',');
    return {
      name,
      pageCount: Number(pageCount || 0),
      sizeBytes: Number(sizeBytes || 0)
    };
  });
}

function runCliQuery(cliPath, dbPath) {
  const query = `SELECT name, COUNT(*) AS page_count, SUM(pgsize) AS size_bytes FROM dbstat WHERE name NOT LIKE 'sqlite_%' GROUP BY name ORDER BY size_bytes DESC;`;
  const result = spawnSync(cliPath, ['-csv', dbPath, query], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });

  if (result.error) {
    throw new CliError(`Failed to execute sqlite3 CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().trim();
    const message = stderr ? `${stderr} (exit code ${result.status})` : `sqlite3 exited with code ${result.status}`;
    throw new CliError(message);
  }

  return parseCliOutput(result.stdout || '');
}

async function findOrDownloadSqliteCli({ allowDownload, asciiEnabled }) {
  const binDir = path.join(__dirname, 'bin');
  const localPath = path.join(binDir, SQLITE_EXECUTABLE);

  if (fs.existsSync(localPath)) {
    if (asciiEnabled) fmt.info(`Using cached sqlite3 binary at ${localPath}`);
    return { path: localPath, source: 'cache', note: `sqlite3 binary cached at ${localPath}` };
  }

  try {
    execSync(`${SQLITE_EXECUTABLE} -version`, { stdio: 'pipe' });
    if (asciiEnabled) fmt.info('Using sqlite3 CLI found in PATH.');
    return { path: SQLITE_EXECUTABLE, source: 'path', note: 'sqlite3 CLI resolved from PATH' };
  } catch (error) {
    // continue to download
  }

  if (!allowDownload) {
    return null;
  }

  if (process.platform !== 'win32') {
    throw new CliError('Automatic sqlite3 download is only supported on Windows. Install sqlite3 or choose a different mode.');
  }

  if (asciiEnabled) fmt.pending('Downloading sqlite3 CLI (Windows bundle)…');
  const downloadedPath = await downloadAndExtract(SQLITE_DOWNLOAD_URL, binDir, SQLITE_EXECUTABLE, asciiEnabled);
  if (asciiEnabled) fmt.success(`sqlite3 CLI downloaded to ${downloadedPath}`);
  return { path: downloadedPath, source: 'download', note: `sqlite3 downloaded to ${downloadedPath}` };
}

async function downloadAndExtract(url, destination, exeName, asciiEnabled) {
  const zipPath = path.join(destination, 'sqlite-tools.zip');
  fs.mkdirSync(destination, { recursive: true });

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new CliError(`Failed to download sqlite3 bundle (HTTP ${response.statusCode}).`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (error) => {
        fs.unlink(zipPath, () => {});
        reject(new CliError(`Unable to download sqlite3 bundle: ${error.message}`));
      });
  });

  if (asciiEnabled) fmt.pending('Extracting sqlite3 bundle…');
  await extract(zipPath, { dir: destination });
  fs.unlinkSync(zipPath);

  let executablePath = null;
  for (const entry of fs.readdirSync(destination)) {
    const entryPath = path.join(destination, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      const candidate = path.join(entryPath, exeName);
      if (fs.existsSync(candidate)) {
        executablePath = path.join(destination, exeName);
        fs.copyFileSync(candidate, executablePath);
        fs.rmSync(entryPath, { recursive: true, force: true });
        break;
      }
    }
  }

  if (!executablePath) {
    executablePath = path.join(destination, exeName);
    if (!fs.existsSync(executablePath)) {
      throw new CliError('sqlite3 executable not found after extraction.');
    }
  }

  return executablePath;
}

function runWorkerAnalysis(dbPath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'db-worker.js'), {
      workerData: { dbPath }
    });

    const cleanUp = () => {
      worker.removeAllListeners('message');
      worker.removeAllListeners('error');
      worker.removeAllListeners('exit');
    };

    worker.once('message', (message) => {
      cleanUp();
      if (message.success) {
        const tables = (message.payload || []).map((row) => ({
          name: row.name,
          pageCount: Number(row.page_count || row.pageCount || 0),
          sizeBytes: Number(row.size_bytes || row.sizeBytes || 0)
        }));
        resolve(tables);
      } else {
        reject(new CliError(`Worker error: ${message.payload?.message || 'Unknown error'}`));
      }
    });

    worker.once('error', (error) => {
      cleanUp();
      reject(new CliError(`Worker thread error: ${error.message}`));
    });

    worker.once('exit', (code) => {
      cleanUp();
      if (code !== 0) {
        reject(new CliError(`Worker exited with code ${code}`));
      }
    });
  });
}

async function executeAnalysis(options, asciiEnabled) {
  const notes = [];
  const fileSizeBytes = getFileSizeBytes(options.dbPath);

  const runDbstat = () => {
    if (asciiEnabled) fmt.pending('Running dbstat query via better-sqlite3…');
    const started = process.hrtime.bigint();
    const tables = collectWithDbstat(options.dbPath);
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    return { tables, durationMs, modeUsed: 'dbstat' };
  };

  const runCli = async () => {
    const cliInfo = await findOrDownloadSqliteCli({ allowDownload: options.allowDownload, asciiEnabled });
    if (!cliInfo) {
      throw new CliError('sqlite3 CLI not available (not found in PATH and downloads disabled).');
    }
    if (cliInfo.note) {
      notes.push(cliInfo.note);
    }
    if (asciiEnabled) fmt.pending(`Running sqlite3 CLI analysis (${cliInfo.source})…`);
    const started = process.hrtime.bigint();
    const tables = runCliQuery(cliInfo.path, options.dbPath);
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    return { tables, durationMs, modeUsed: 'cli' };
  };

  const runWorker = async () => {
    if (asciiEnabled) fmt.pending('Running worker-based table scan (slow)…');
    const started = process.hrtime.bigint();
    const tables = await runWorkerAnalysis(options.dbPath);
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    notes.push('Executed worker fallback to collect dbstat metrics.');
    return { tables, durationMs, modeUsed: 'worker' };
  };

  const runSizeOnly = () => ({ tables: [], durationMs: 0, modeUsed: 'size' });

  let analysis;
  if (options.mode === 'cli') {
    analysis = await runCli();
  } else if (options.mode === 'worker') {
    analysis = await runWorker();
  } else if (options.mode === 'size') {
    analysis = runSizeOnly();
  } else {
    try {
      analysis = runDbstat();
    } catch (error) {
      if (typeof error.message === 'string' && error.message.includes('no such table: dbstat')) {
        if (asciiEnabled) fmt.warn('Direct dbstat query unavailable; attempting sqlite3 CLI fallback.');
        try {
          analysis = await runCli();
        } catch (cliError) {
          if (asciiEnabled) fmt.warn('sqlite3 CLI fallback failed; attempting worker analysis.');
          analysis = await runWorker();
        }
      } else {
        throw error;
      }
    }
  }

  const totalBytes = analysis.modeUsed === 'size'
    ? null
    : analysis.tables.reduce((sum, row) => sum + Number(row.sizeBytes || 0), 0);

  const tables = analysis.tables
    .map((row) => ({
      name: row.name,
      pageCount: Number(row.pageCount || 0),
      sizeBytes: Number(row.sizeBytes || 0),
      percent: totalBytes && totalBytes > 0 ? (Number(row.sizeBytes || 0) / totalBytes) * 100 : 0
    }))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    dbPath: options.dbPath,
    modeUsed: analysis.modeUsed,
    durationMs: analysis.durationMs,
    tables,
    totalBytes,
    fileSizeBytes,
    notes
  };
}

function renderAscii(report, options) {
  fmt.header('Database Table Sizes');
  fmt.settings(`Database: ${report.dbPath}`);

  const modeLabel = {
    dbstat: 'Direct dbstat query (better-sqlite3)',
    cli: 'sqlite3 CLI query',
    worker: 'Worker thread dbstat query',
    size: 'File size summary only'
  }[report.modeUsed] || report.modeUsed;

  fmt.section('Overview');
  fmt.stat('Mode', modeLabel);
  fmt.stat('Tables analyzed', report.tables.length, 'number');
  fmt.stat('Duration', formatDuration(report.durationMs));
  fmt.stat('Database file size', formatBytes(report.fileSizeBytes));
  if (report.totalBytes != null) {
    fmt.stat('Combined table size', formatBytes(report.totalBytes));
  }

  if (report.modeUsed === 'size') {
    fmt.info('Size-only mode selected; run in auto/cli/worker mode for per-table details.');
    return;
  }

  if (!report.tables.length) {
    fmt.warn('No table statistics available (dbstat returned zero rows).');
    return;
  }

  const limit = options.limit === 0 ? report.tables.length : Math.min(report.tables.length, options.limit);
  fmt.section(`Top ${limit} Table${limit === 1 ? '' : 's'} by Size`);

  const rows = report.tables.slice(0, limit).map((table, index) => ({
    '#': index + 1,
    Table: table.name,
    Pages: table.pageCount.toLocaleString(),
    Size: formatBytes(table.sizeBytes),
    '% of Total': report.totalBytes ? `${table.percent.toFixed(1)}%` : '—'
  }));

  fmt.table(rows, { columns: ['#', 'Table', 'Pages', 'Size', '% of Total'] });

  if (limit < report.tables.length) {
    fmt.info(`${report.tables.length - limit} additional table(s) not shown (increase --limit to view more).`);
  }

  if (report.notes.length) {
    fmt.section('Notes');
    report.notes.forEach((note) => fmt.info(note));
  }

  fmt.success('Analysis complete.');
}

function emitJson(report, options) {
  const totalTables = report.tables.length;
  const limit = options.limit === 0 ? totalTables : Math.min(totalTables, options.limit);
  const hiddenTableCount = Math.max(totalTables - limit, 0);
  const tables = report.modeUsed === 'size'
    ? []
    : report.tables.slice(0, limit).map((table) => ({
        name: table.name,
        pageCount: table.pageCount,
        sizeBytes: table.sizeBytes,
        sizeFormatted: formatBytes(table.sizeBytes),
        percentOfTotal: Number(table.percent.toFixed(4))
      }));

  const payload = {
    databasePath: report.dbPath,
    mode: report.modeUsed,
    durationMs: Number(report.durationMs.toFixed(2)),
    tableCount: totalTables,
    tablesDisplayed: tables.length,
    hiddenTableCount,
    limitRequested: options.limit,
    totalTableBytes: report.totalBytes,
    totalTableBytesFormatted: report.totalBytes != null ? formatBytes(report.totalBytes) : null,
    fileSizeBytes: report.fileSizeBytes,
    fileSizeFormatted: formatBytes(report.fileSizeBytes),
    limitApplied: limit,
    notes: report.notes,
    tables
  };

  const spacing = options.quiet ? undefined : 2;
  console.log(JSON.stringify(payload, null, spacing));
}

async function main(argv = process.argv) {
  let rawOptions;
  try {
    rawOptions = createParser().parse(argv);
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

  const asciiEnabled = options.summaryFormat !== 'json' || !options.quiet;
  const jsonEnabled = options.summaryFormat === 'json';

  let report;
  try {
    report = await executeAnalysis(options, asciiEnabled);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    fmt.error(error.message || 'Analysis failed.');
    process.exit(exitCode);
  }

  if (asciiEnabled) {
    renderAscii(report, options);
  }

  if (jsonEnabled) {
    emitJson(report, options);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  createParser,
  normalizeOptions,
  executeAnalysis,
  formatBytes,
  formatDuration
};
