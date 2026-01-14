#!/usr/bin/env node
// Export gazetteer data to a single NDJSON file with structured summary output.
// Tables: places, place_names, place_hierarchy, place_external_ids, place_sources
// Excludes non-human-readable shapes data from `extra` column when present.

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { is_array, tof } = require('lang-tools');
const { openDbReadOnly, ensureDb } = require('../data/db/sqlite');
const {
  iteratePlaceSources,
  iteratePlaces,
  iteratePlaceNames,
  iteratePlaceHierarchy,
  iteratePlaceExternalIds
} = require('../data/db/sqlite/v1/tools/gazetteerExport');
const { findProjectRoot } = require('../shared/utils/project-root');
const { CliFormatter } = require('../shared/utils/CliFormatter');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');

const fmt = new CliFormatter();

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'export-gazetteer',
    'Export gazetteer tables to NDJSON with optional summary output'
  );

  parser
    .add('--db <path>', 'Path to gazetteer database', 'data/gazetteer.db')
    .add('--out <path>', 'Destination NDJSON file', 'data/gazetteer.ndjson')
    .add('--format <mode>', 'Summary format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress summary output (errors still shown)', false, 'boolean');

  return parser.parse(argv);
}

// Remove likely non-human-readable geometry/shape fields from extra JSON
function scrubExtra(extra) {
  if (!extra) return extra;
  let obj = extra;
  if (tof(extra) === 'string') {
    try { obj = JSON.parse(extra); } catch (_) { return extra; }
  }
  if (obj && tof(obj) === 'object') {
    const removeKeys = new Set([
      'geometry','geom','wkt','shape','shapes','polygon','polygons','multipolygon','linestring','coordinates','coord','boundary','border','geoshape','geojson','footprint'
    ]);
    for (const k of Object.keys(obj)) {
      if (removeKeys.has(k)) delete obj[k];
      // Heuristic: very large numeric arrays are not human-friendly
      else if (is_array(obj[k]) && obj[k].length > 50 && obj[k].every(v => tof(v) === 'number')) delete obj[k];
    }
    return obj;
  }
  return extra;
}

function resolveOutPath(outArg) {
  const projectRoot = findProjectRoot(__dirname);
  const defaultOut = path.join(projectRoot, 'data', 'gazetteer.ndjson');
  if (!outArg) return defaultOut;
  return path.isAbsolute(outArg) ? outArg : path.join(projectRoot, outArg);
}

function resolveDbPath(dbArg) {
  if (!dbArg) return undefined;
  const projectRoot = findProjectRoot(__dirname);
  return path.isAbsolute(dbArg) ? dbArg : path.join(projectRoot, dbArg);
}

function writeNdjsonLineSync(fd, obj) {
  // Synchronous write to ensure durability before process exit
  fs.writeSync(fd, JSON.stringify(obj));
  fs.writeSync(fd, '\n');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'n/a';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function exportGazetteer({ dbPath, outPath }) {
  const startedAt = new Date();
  const startedMs = performance.now();

  const counts = {
    place_sources: 0,
    places: 0,
    place_names: 0,
    place_hierarchy: 0,
    place_external_ids: 0
  };

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const fd = fs.openSync(outPath, 'w');

  let db;
  try {
    try {
      db = openDbReadOnly(dbPath);
    } catch (error) {
      db = ensureDb(dbPath);
    }

    for (const row of iteratePlaceSources(db)) {
      counts.place_sources += 1;
      writeNdjsonLineSync(fd, { type: 'place_source', ...row });
    }

    for (const row of iteratePlaces(db)) {
      counts.places += 1;
      const out = { ...row };
      if (out && out.extra != null) {
        out.extra = scrubExtra(out.extra);
      }
      writeNdjsonLineSync(fd, { type: 'place', ...out });
    }

    for (const row of iteratePlaceNames(db)) {
      counts.place_names += 1;
      writeNdjsonLineSync(fd, { type: 'place_name', ...row });
    }

    for (const row of iteratePlaceHierarchy(db)) {
      counts.place_hierarchy += 1;
      writeNdjsonLineSync(fd, { type: 'place_hierarchy', ...row });
    }

    for (const row of iteratePlaceExternalIds(db)) {
      counts.place_external_ids += 1;
      writeNdjsonLineSync(fd, { type: 'place_external_id', ...row });
    }
  } finally {
    try { db?.close(); } catch (_) {}
    try { fs.closeSync(fd); } catch (_) {}
  }

  const finishedAt = new Date();
  const durationMs = performance.now() - startedMs;
  const totalRecords = Object.values(counts).reduce((acc, value) => acc + value, 0);
  let fileSizeBytes = null;
  try {
    fileSizeBytes = fs.statSync(outPath).size;
  } catch (_) {
    fileSizeBytes = null;
  }

  return {
    dbPath,
    outPath,
    counts,
    totalRecords,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs,
    fileSizeBytes
  };
}

function main() {
  const args = parseArgs(process.argv);
  const format = String(args.format || 'ascii').trim().toLowerCase();
  if (!['ascii', 'json'].includes(format)) {
    fmt.error(`Unsupported format: ${args.format}. Use "ascii" or "json".`);
    process.exitCode = 1;
    return;
  }

  const dbPath = resolveDbPath(args.db);
  const outPath = resolveOutPath(args.out);

  let summary;
  try {
    summary = exportGazetteer({ dbPath, outPath });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (args.quiet) {
      console.error(message);
    } else {
      fmt.error(message);
    }
    process.exitCode = 1;
    return;
  }

  if (args.quiet) {
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify({
      status: 'ok',
      ...summary,
    }, null, 2));
    return;
  }

  fmt.header('Gazetteer Export');
  fmt.section('Output');
  fmt.info(`Database: ${summary.dbPath}`);
  fmt.info(`Output File: ${summary.outPath}`);
  if (Number.isFinite(summary.fileSizeBytes)) {
    fmt.stat('File Size', formatBytes(summary.fileSizeBytes));
  }
  fmt.stat('Duration', `${(summary.durationMs / 1000).toFixed(2)} s`);

  fmt.blank();
  fmt.section('Records Written');
  fmt.stat('Place sources', summary.counts.place_sources, 'number');
  fmt.stat('Places', summary.counts.places, 'number');
  fmt.stat('Place names', summary.counts.place_names, 'number');
  fmt.stat('Place hierarchy', summary.counts.place_hierarchy, 'number');
  fmt.stat('Place external IDs', summary.counts.place_external_ids, 'number');
  fmt.stat('Total records', summary.totalRecords, 'number');

  fmt.blank();
  fmt.success('Export complete');
  fmt.footer();
}

if (require.main === module) {
  main();
}

module.exports = { scrubExtra };
