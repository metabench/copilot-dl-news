#!/usr/bin/env node
/**
 * Database query runner — execute read-only queries without triggering approval dialogs.
 */

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/shared/utils/CliFormatter');
const { CliArgumentParser } = require('../src/shared/utils/CliArgumentParser');
const { openDatabase } = require('../src/data/db/sqlite/v1');
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
    'db-query',
    'Execute read-only SQL queries against the news database.'
  );

  parser
    .add('--db <path>', 'Path to SQLite database', DEFAULT_DB_PATH)
    .add('--sql <statement>', 'Provide the SQL query explicitly')
    .add('--file <path>', 'Read SQL query from file')
    .add('--json', 'Output results as JSON (alias for --format json)', false, 'boolean')
    .add('--format <mode>', 'Output format: table | json', 'table')
    .add('--limit <number>', 'Limit displayed rows in table output', undefined, 'int')
    .add('--quiet', 'Suppress footer summary when using table output', false, 'boolean')
    .add('--list', 'List tables/views (overrides query)', false, 'boolean');

  return parser;
}

function resolveDatabasePath(optionPath) {
  const candidate = optionPath || process.env.DB_PATH || DEFAULT_DB_PATH;
  const resolved = path.resolve(candidate);
  if (fs.existsSync(resolved)) {
    return resolved;
  }
  throw new CliError(`Database not found at ${resolved}. Use --db or set DB_PATH.`);
}

function readQueryFromFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new CliError(`SQL file not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function ensureAllowedQuery(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new CliError('SQL query is empty.');
  }
  const normalized = trimmed.toLowerCase();
  if (
    normalized.startsWith('select') ||
    normalized.startsWith('pragma') ||
    normalized.startsWith('explain') ||
    normalized.startsWith('with ')
  ) {
    return trimmed;
  }
  throw new CliError('Only SELECT, PRAGMA, EXPLAIN, or WITH queries are permitted (connection is read-only).');
}

function normalizeOptions(rawOptions) {
  const positional = Array.isArray(rawOptions.positional) ? rawOptions.positional : [];
  const positionalTokens = positional
    .filter((token) => typeof token === 'string')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith('-'));

  if (rawOptions.sql && positionalTokens.length) {
    throw new CliError('Provide the query via --sql, --file, or positional arguments — not multiple sources.');
  }
  if (rawOptions.sql && rawOptions.file) {
    throw new CliError('Use either --sql or --file to provide the query (not both).');
  }

  const format = (rawOptions.json ? 'json' : rawOptions.format || 'table').toLowerCase();
  if (!['table', 'json'].includes(format)) {
    throw new CliError(`Unsupported format: ${rawOptions.format}. Use table or json.`);
  }

  const limit = rawOptions.limit != null ? rawOptions.limit : null;
  if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
    throw new CliError('The --limit option must be a positive integer.');
  }

  let query = null;
  if (rawOptions.file) {
    query = readQueryFromFile(rawOptions.file);
  } else if (rawOptions.sql) {
    query = rawOptions.sql;
  } else if (positionalTokens.length) {
    query = positionalTokens.join(' ');
  }

  if (rawOptions.list) {
    if (query) {
      throw new CliError('The --list flag cannot be combined with a custom SQL query.');
    }
    query = `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name`;
  }

  if (!query) {
    throw new CliError('No SQL query provided. Use --sql, --file, positional SQL, or --list.');
  }

  const validatedQuery = ensureAllowedQuery(query);
  const dbPath = resolveDatabasePath(rawOptions.db);

  return {
    dbPath,
    query: validatedQuery,
    format,
    limit: limit != null ? Math.floor(limit) : null,
    quiet: Boolean(rawOptions.quiet)
  };
}

function executeQuery(dbPath, query) {
  const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  try {
    const statement = db.prepare(query);
    return statement.all();
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function renderTableOutput(options, rows) {
  const truncatedQuery = options.query.length > 200
    ? `${options.query.slice(0, 197)}…`
    : options.query;

  fmt.header('Database Query Results');
  fmt.section('Execution');
  fmt.stat('Database', options.dbPath);
  fmt.stat('Query', truncatedQuery);

  fmt.section('Rows');
  if (!rows.length) {
    fmt.info('No rows returned.');
  } else {
    const displayRows = options.limit != null ? rows.slice(0, options.limit) : rows;
    fmt.table(displayRows);
    if (options.limit != null && rows.length > options.limit) {
      const hiddenCount = rows.length - options.limit;
      fmt.info(`${hiddenCount} additional row${hiddenCount === 1 ? '' : 's'} not shown (adjust --limit to view all).`);
    }
  }

  if (!options.quiet) {
    fmt.summary({
      'Rows returned': rows.length,
      'Output format': options.format
    });
  }

  fmt.footer();
}

function main(argv = process.argv) {
  const argvArray = Array.isArray(argv) ? argv : [];
  const effectiveArgv = argvArray.length ? argvArray : process.argv;
  const parser = createParser();
  let rawOptions;

  try {
    rawOptions = parser.parse(effectiveArgv);
  } catch (error) {
    fmt.error(error?.message || 'Failed to parse arguments.');
    process.exit(1);
  }

  if (process.env.DB_QUERY_DEBUG) {
    // Helpful for diagnosing positional parsing edge cases
    console.error('[debug] raw options:', JSON.stringify(rawOptions));
  }

  let options;
  try {
    const sanitizedOptions = Array.isArray(rawOptions.positional)
      ? {
          ...rawOptions,
          positional: rawOptions.positional.filter((token) => ![effectiveArgv[0], effectiveArgv[1]].includes(token))
        }
      : rawOptions;
    options = normalizeOptions(sanitizedOptions);
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    fmt.error(error.message || 'Invalid configuration.');
    process.exit(exitCode);
  }

  let rows;
  try {
    rows = executeQuery(options.dbPath, options.query);
  } catch (error) {
    fmt.error(`Query error: ${error.message || error}`);
    process.exit(1);
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  renderTableOutput(options, rows);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  ensureAllowedQuery,
  normalizeOptions,
  executeQuery
};
