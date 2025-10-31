#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const {
  getTableInfo,
  getTableIndexes,
  getIndexInfo,
  getAllTablesAndViews,
  tableExists,
  getAllIndexes,
  getForeignKeys,
  getAllTables,
  getTableRowCount
} = require('../src/db/sqlite/v1/queries/schema');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

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

function createParser() {
  const parser = new CliArgumentParser(
    'db-schema',
    'Inspect SQLite tables, indexes, and statistics without approval dialogs.'
  );

  parser
    .add('--db <path>', 'Path to the SQLite database', DEFAULT_DB_PATH)
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII output and emit JSON only', false, 'boolean');

  return parser;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  const decimals = index === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function normalizeOptions(raw) {
  const resolvedDb = raw.db || process.env.DB_PATH || DEFAULT_DB_PATH;
  const dbPath = path.isAbsolute(resolvedDb)
    ? resolvedDb
    : path.join(process.cwd(), resolvedDb);

  const summaryFormat = typeof raw.summaryFormat === 'string'
    ? raw.summaryFormat.trim().toLowerCase()
    : 'ascii';

  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${raw.summaryFormat}`);
  }

  if (!fs.existsSync(dbPath)) {
    throw new CliError(`Database not found at ${dbPath}. Use --db to provide a valid path.`);
  }

  return {
    dbPath,
    summaryFormat,
    quiet: Boolean(raw.quiet)
  };
}

function openDatabase(dbPath) {
  try {
    return new Database(dbPath, { readonly: true });
  } catch (error) {
    throw new CliError(`Unable to open database at ${dbPath}: ${error.message}`);
  }
}

function ensureTableExists(db, tableName) {
  const exists = tableExists(db, tableName);
  if (!exists) {
    throw new CliError(`Table '${tableName}' not found.`);
  }
}

function handleTables(db, options) {
  const tables = getAllTablesAndViews(db);
  return {
    type: 'tables',
    dbPath: options.dbPath,
    tables
  };
}

function handleDescribeTable(db, tableName, options) {
  if (!tableName) {
    throw new CliError('Table name is required. Usage: table <name>.');
  }

  ensureTableExists(db, tableName);
  const columns = getTableInfo(db, tableName).map((col) => ({
    position: col.cid,
    name: col.name,
    type: col.type,
    notNull: Boolean(col.notnull),
    defaultValue: col.dflt_value || null,
    primaryKeyPosition: col.pk || 0
  }));

  return {
    type: 'table',
    dbPath: options.dbPath,
    table: tableName,
    columnCount: columns.length,
    columns
  };
}

function handleIndexes(db, tableName, options) {
  if (tableName) {
    ensureTableExists(db, tableName);
    const indexes = getTableIndexes(db, tableName).map((idx) => {
      const columns = getIndexInfo(db, idx.name).map((col) => col.name);
      return {
        name: idx.name,
        unique: Boolean(idx.unique),
        origin: idx.origin,
        partial: Boolean(idx.partial),
        columns
      };
    });

    return {
      type: 'indexes',
      scope: 'table',
      dbPath: options.dbPath,
      table: tableName,
      indexes
    };
  }

  const indexes = getAllIndexes(db).map((idx) => ({
    name: idx.name,
    table: idx.tbl_name,
    hasDefinition: Boolean(idx.sql),
    definition: idx.sql || null
  }));

  return {
    type: 'indexes',
    scope: 'database',
    dbPath: options.dbPath,
    indexes
  };
}

function handleForeignKeys(db, tableName, options) {
  if (!tableName) {
    throw new CliError('Table name is required. Usage: foreign-keys <name>.');
  }

  ensureTableExists(db, tableName);
  const foreignKeys = getForeignKeys(db, tableName).map((fk) => ({
    id: fk.id,
    sequence: fk.seq,
    from: fk.from,
    toTable: fk.table,
    toColumn: fk.to,
    onUpdate: fk.on_update,
    onDelete: fk.on_delete,
    match: fk.match
  }));

  return {
    type: 'foreign-keys',
    dbPath: options.dbPath,
    table: tableName,
    foreignKeys
  };
}

function handleStats(db, options) {
  const tables = getAllTables(db);
  const rows = [];

  for (const { name } of tables) {
    try {
      const count = getTableRowCount(db, name);
      rows.push({ table: name, rows: count });
    } catch (error) {
      rows.push({ table: name, rows: null, error: error.message });
    }
  }

  let databaseSizeBytes = null;
  try {
    const stats = fs.statSync(options.dbPath);
    databaseSizeBytes = stats.size;
  } catch (_) {
    databaseSizeBytes = null;
  }

  return {
    type: 'stats',
    dbPath: options.dbPath,
    tables: rows,
    tableCount: rows.length,
    databaseSizeBytes
  };
}

function executeCommand(db, command, params, options) {
  switch (command) {
    case 'tables':
      return handleTables(db, options);
    case 'table':
      return handleDescribeTable(db, params[0], options);
    case 'indexes':
      return handleIndexes(db, params[0], options);
    case 'foreign-keys':
      return handleForeignKeys(db, params[0], options);
    case 'stats':
      return handleStats(db, options);
    default:
      throw new CliError(`Unknown command '${command}'. Run with --help for usage.`);
  }
}

function renderTables(result) {
  fmt.header('Database Tables');
  fmt.settings(`Database: ${result.dbPath}`);
  fmt.section('Summary');
  fmt.stat('Tables & views', result.tables.length, 'number');

  if (result.tables.length === 0) {
    fmt.info('No tables or views found.');
    return;
  }

  const rows = result.tables.map((row, index) => ({
    '#': index + 1,
    Name: row.name,
    Type: row.type
  }));

  fmt.section('Tables');
  fmt.table(rows, { columns: ['#', 'Name', 'Type'] });
  fmt.success('Done.');
}

function renderTable(result) {
  fmt.header(`Table: ${result.table}`);
  fmt.settings(`Database: ${result.dbPath}`);
  fmt.section('Summary');
  fmt.stat('Columns', result.columnCount, 'number');

  if (result.columnCount === 0) {
    fmt.info('No columns returned.');
    return;
  }

  const rows = result.columns.map((col) => ({
    '#': col.position,
    Name: col.name,
    Type: col.type || '',
    'Not Null': col.notNull ? 'Yes' : 'No',
    Default: col.defaultValue === null ? '' : String(col.defaultValue),
    'PK Position': col.primaryKeyPosition ? String(col.primaryKeyPosition) : ''
  }));

  fmt.section('Columns');
  fmt.table(rows, { columns: ['#', 'Name', 'Type', 'Not Null', 'Default', 'PK Position'] });
  fmt.success('Done.');
}

function renderIndexes(result) {
  if (result.scope === 'table') {
    fmt.header(`Indexes for ${result.table}`);
    fmt.settings(`Database: ${result.dbPath}`);
    fmt.section('Summary');
    fmt.stat('Indexes', result.indexes.length, 'number');

    if (result.indexes.length === 0) {
      fmt.info('No indexes found for this table.');
      return;
    }

    const rows = result.indexes.map((idx) => ({
      Name: idx.name,
      Unique: idx.unique ? 'Yes' : 'No',
      Origin: idx.origin,
      Partial: idx.partial ? 'Yes' : 'No',
      Columns: idx.columns.join(', ')
    }));

    fmt.section('Indexes');
    fmt.table(rows, { columns: ['Name', 'Unique', 'Origin', 'Partial', 'Columns'] });
    fmt.success('Done.');
    return;
  }

  fmt.header('Database Indexes');
  fmt.settings(`Database: ${result.dbPath}`);
  fmt.section('Summary');
  fmt.stat('Indexes', result.indexes.length, 'number');

  if (result.indexes.length === 0) {
    fmt.info('No indexes found.');
    return;
  }

  const rows = result.indexes.map((idx, index) => ({
    '#': index + 1,
    Name: idx.name,
    Table: idx.table,
    Defined: idx.hasDefinition ? 'Yes' : 'No'
  }));

  fmt.section('Indexes');
  fmt.table(rows, { columns: ['#', 'Name', 'Table', 'Defined'] });
  fmt.success('Done.');
}

function renderForeignKeys(result) {
  fmt.header(`Foreign Keys for ${result.table}`);
  fmt.settings(`Database: ${result.dbPath}`);
  fmt.section('Summary');
  fmt.stat('Foreign keys', result.foreignKeys.length, 'number');

  if (result.foreignKeys.length === 0) {
    fmt.info('No foreign keys defined for this table.');
    return;
  }

  const rows = result.foreignKeys.map((fk) => ({
    ID: fk.id,
    Seq: fk.sequence,
    From: fk.from,
    'To Table': fk.toTable,
    'To Column': fk.toColumn,
    'On Update': fk.onUpdate,
    'On Delete': fk.onDelete,
    Match: fk.match || ''
  }));

  fmt.section('Foreign Keys');
  fmt.table(rows, {
    columns: ['ID', 'Seq', 'From', 'To Table', 'To Column', 'On Update', 'On Delete', 'Match']
  });
  fmt.success('Done.');
}

function renderStats(result) {
  fmt.header('Table Statistics');
  fmt.settings(`Database: ${result.dbPath}`);
  fmt.section('Summary');
  fmt.stat('Tables counted', result.tableCount, 'number');

  if (Number.isFinite(result.databaseSizeBytes)) {
    fmt.stat('Database size', formatBytes(result.databaseSizeBytes));
  }

  if (result.tables.length === 0) {
    fmt.info('No tables found to count.');
    return;
  }

  const rows = result.tables.map((entry, index) => ({
    '#': index + 1,
    Table: entry.table,
    Rows: entry.rows === null ? 'error' : entry.rows,
    Error: entry.rows === null ? (entry.error || '') : ''
  }));

  fmt.section('Row Counts');
  fmt.table(rows, { columns: ['#', 'Table', 'Rows', 'Error'] });
  fmt.success('Done.');
}

function buildJson(result) {
  return result;
}

function emitResult(result, options) {
  if (options.quiet || options.summaryFormat === 'json') {
    console.log(JSON.stringify(buildJson(result), null, options.quiet ? undefined : 2));
    return;
  }

  switch (result.type) {
    case 'tables':
      renderTables(result);
      break;
    case 'table':
      renderTable(result);
      break;
    case 'indexes':
      renderIndexes(result);
      break;
    case 'foreign-keys':
      renderForeignKeys(result);
      break;
    case 'stats':
      renderStats(result);
      break;
    default:
      fmt.error(`Unhandled result type: ${result.type}`);
  }
}

function main() {
  const parser = createParser();
  let rawArgs;

  try {
    rawArgs = parser.parse(process.argv.slice(2));
  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }

  const positional = rawArgs.positional || [];

  if (positional.length === 0 || positional[0] === 'help') {
    parser.getProgram().outputHelp();
    return;
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

  const db = openDatabase(options.dbPath);

  try {
    const command = positional[0];
    const params = positional.slice(1);
    const result = executeCommand(db, command, params, options);
    emitResult(result, options);
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
  } finally {
    db.close();
  }
}

main();
