#!/usr/bin/env node
// Export gazetteer data to a single NDJSON file.
// Tables: places, place_names, place_hierarchy, place_external_ids, place_sources
// Excludes non-human-readable shapes data from `extra` column when present.

const fs = require('fs');
const path = require('path');
const { openDbReadOnly } = require('../ensure_db');
const { findProjectRoot } = require('../utils/project-root');

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2]; else if (a.startsWith('--')) args[a.slice(2)] = '1';
  }
  return args;
}

// Remove likely non-human-readable geometry/shape fields from extra JSON
function scrubExtra(extra) {
  if (!extra) return extra;
  let obj = extra;
  if (typeof extra === 'string') {
    try { obj = JSON.parse(extra); } catch (_) { return extra; }
  }
  if (obj && typeof obj === 'object') {
    const removeKeys = new Set([
      'geometry','geom','wkt','shape','shapes','polygon','polygons','multipolygon','linestring','coordinates','coord','boundary','border','geoshape','geojson','footprint'
    ]);
    for (const k of Object.keys(obj)) {
      if (removeKeys.has(k)) delete obj[k];
      // Heuristic: very large numeric arrays are not human-friendly
      else if (Array.isArray(obj[k]) && obj[k].length > 50 && obj[k].every(v => typeof v === 'number')) delete obj[k];
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

function writeNdjsonLineSync(fd, obj) {
  // Synchronous write to ensure durability before process exit
  fs.writeSync(fd, JSON.stringify(obj));
  fs.writeSync(fd, '\n');
}

function exportTableIter(db, fd, table, typeName, transformRow) {
  const stmt = db.prepare(`SELECT * FROM ${table}`);
  for (const row of stmt.iterate()) {
    const rec = transformRow ? transformRow(row) : row;
    writeNdjsonLineSync(fd, { type: typeName, ...rec });
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db; // ensureDb resolves default path when undefined
  const outPath = resolveOutPath(args.out);

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Open file descriptor for synchronous writes (ensures file existence before exit)
  const fd = fs.openSync(outPath, 'w');

  // Open DB in read-only when possible; fall back to RW ensureDb if file is missing or RO open fails
  let db;
  try {
    db = openDbReadOnly(dbPath);
  } catch (e) {
    // Best-effort: create/ensure schema and proceed (useful in CI where path may not exist yet)
    try {
      const { ensureDb } = require('../ensure_db');
      db = ensureDb(dbPath);
    } catch (e2) {
      // Close FD and rethrow to maintain failure semantics
      try { fs.closeSync(fd); } catch (_) {}
      throw e2;
    }
  }

  try {
    // place_sources first for context (skip gracefully if table absent)
    try { exportTableIter(db, fd, 'place_sources', 'place_source'); } catch (_) {}

    // places with scrubbed extra
    try {
      exportTableIter(db, fd, 'places', 'place', (row) => {
        const out = { ...row };
        if (out && out.extra != null) {
          const scrubbed = scrubExtra(out.extra);
          // Store as object if parsed, else keep as-is
          out.extra = scrubbed;
        }
        return out;
      });
    } catch (_) {}

    try { exportTableIter(db, fd, 'place_names', 'place_name'); } catch (_) {}
    try { exportTableIter(db, fd, 'place_hierarchy', 'place_hierarchy'); } catch (_) {}
    try { exportTableIter(db, fd, 'place_external_ids', 'place_external_id'); } catch (_) {}
  } finally {
    try { db.close(); } catch (_) {}
    try { fs.closeSync(fd); } catch (_) {}
  }

  if (!args.quiet) {
    console.error(`Exported gazetteer to ${outPath}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scrubExtra };
