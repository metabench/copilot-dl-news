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

function writeNdjsonLine(ws, obj) {
  ws.write(JSON.stringify(obj) + '\n');
}

function exportTableIter(db, ws, table, typeName, transformRow) {
  const stmt = db.prepare(`SELECT * FROM ${table}`);
  for (const row of stmt.iterate()) {
    const rec = transformRow ? transformRow(row) : row;
    writeNdjsonLine(ws, { type: typeName, ...rec });
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db; // ensureDb resolves default path when undefined
  const outPath = resolveOutPath(args.out);

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });

  const db = openDbReadOnly(dbPath);
  try {
    // place_sources first for context
    exportTableIter(db, ws, 'place_sources', 'place_source');

    // places with scrubbed extra
    exportTableIter(db, ws, 'places', 'place', (row) => {
      const out = { ...row };
      if (out && out.extra != null) {
        const scrubbed = scrubExtra(out.extra);
        // Store as object if parsed, else keep as-is
        out.extra = scrubbed;
      }
      return out;
    });

    exportTableIter(db, ws, 'place_names', 'place_name');
    exportTableIter(db, ws, 'place_hierarchy', 'place_hierarchy');
    exportTableIter(db, ws, 'place_external_ids', 'place_external_id');
  } finally {
    db.close();
    ws.end();
  }

  if (!args.quiet) {
    console.error(`Exported gazetteer to ${outPath}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { scrubExtra };
