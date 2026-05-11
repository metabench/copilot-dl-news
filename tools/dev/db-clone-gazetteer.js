#!/usr/bin/env node
'use strict';

// Clone gazetteer tables from a source SQLite database into a fresh destination
// database that keeps the full schema but only copies gazetteer data (no
// downloads, site patterns, or crawl history). DB work is delegated to
// news-crawler-db so this repo only owns CLI parsing and presentation.

const path = require('path');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');
const { CliFormatter } = require('../../src/utils/CliFormatter');
const { findProjectRoot } = require('../../src/utils/project-root');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const fmt = new CliFormatter();

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'db-clone-gazetteer',
    'Clone gazetteer tables into a fresh database with empty downloads/site patterns'
  );

  parser
    .add('--source <path>', 'Source database path', 'data/news.db')
    .add('--dest <path>', 'Destination database path', 'data/news-gazetteer-only.db')
    .add('--tables <csv>', 'Optional comma-separated table whitelist (defaults to gazetteer set)')
    .add('--overwrite', 'Overwrite destination if it exists', false, 'boolean')
    .add('--json', 'Emit JSON summary', false, 'boolean')
    .add('--quiet', 'Suppress human-friendly output', false, 'boolean')
    .add('--verbose', 'Verbose schema initialization logging', false, 'boolean');

  return parser.parse(argv);
}

function resolvePath(projectRoot, candidate) {
  if (!candidate) return undefined;
  return path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
}

function getDbExport(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const value = dbModule[name];
  if (value === undefined) {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return value;
}

function main() {
  const args = parseArgs(process.argv);
  const projectRoot = findProjectRoot(__dirname);
  const sourcePath = resolvePath(projectRoot, args.source);
  const destPath = resolvePath(projectRoot, args.dest);
  const overwrite = !!args.overwrite;
  const tables = args.tables
    ? args.tables.split(',').map((t) => t.trim()).filter(Boolean)
    : getDbExport('GAZETTEER_CLONE_DEFAULT_TABLES').slice();

  const summary = {
    source: sourcePath,
    destination: destPath,
    tables,
    copied: [],
    startedAt: new Date().toISOString()
  };

  try {
    const cloneGazetteerTablesToSqliteDb = getDbExport('cloneGazetteerTablesToSqliteDb');
    Object.assign(summary, cloneGazetteerTablesToSqliteDb({
      sourcePath,
      destPath,
      tables,
      overwrite,
      verbose: !!args.verbose,
      logger: console
    }));
  } catch (error) {
    summary.error = error?.message || String(error);
    fmt.error(summary.error);
    process.exitCode = 1;
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (args.quiet) {
    if (summary.error) process.exit(1);
    return;
  }

  fmt.header('Gazetteer Clone');
  fmt.info(`Source: ${summary.source}`);
  fmt.info(`Destination: ${summary.destination}`);
  fmt.info(`Tables: ${summary.tables.join(', ')}`);
  fmt.blank();

  if (summary.error) {
    fmt.error(summary.error);
    process.exit(1);
    return;
  }

  fmt.section('Copy Results');
  for (const result of summary.copied) {
    const label = `${result.table}: ${result.status}`;
    if (result.status === 'ok') {
      fmt.stat(label, `${result.copied} rows`);
    } else {
      fmt.warn(`${label} (${result.reason})`);
    }
  }

  fmt.success('Clone complete');
  fmt.footer();
}

if (require.main === module) {
  main();
}
