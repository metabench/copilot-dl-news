#!/usr/bin/env node
// Maintenance tool for the SQLite DB: dedupe and enforce constraints

const path = require('path');
const { ensureDb } = require('../db/ensureNewsDb');
const { dedupePlaceSources } = require('news-crawler-db');
const { repairGazetteerIntegrity: repairGazetteer } = require('news-crawler-db');
// Historical names for ncdb's MaintainDb surface (retired v1/tools
// wrapper); trimPlaceNames keeps its never-throws boolean contract.
const {
  countMaintainDbPlaces: countPlaces,
  countMaintainDbPlaceNames: countPlaceNames,
  normalizeMissingPlaceNames: normalizePlaceNames,
  trimStoredPlaceNames,
  deleteEmptyPlaceNames,
  deleteNamelessPlaces
} = require('news-crawler-db');
const trimPlaceNames = (db) => { try { trimStoredPlaceNames(db); return true; } catch (_) { return false; } };

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2]; else if (a.startsWith('--')) args[a.slice(2)] = '1';
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db; // ensureDb will create if missing
  const db = ensureDb(dbPath);
  try {
    const results = {};
    // Always dedupe place_sources; it's safe and idempotent
    results.place_sources = dedupePlaceSources(db);
    normalizePlaceNames(db);
    const beforePlaces = countPlaces(db);
    const beforeNames = countPlaceNames(db);
    trimPlaceNames(db);
    deleteEmptyPlaceNames(db);
    deleteNamelessPlaces(db);
    // Use shared repair actions
    const actions = repairGazetteer(db);
    const afterPlaces = countPlaces(db);
    const afterNames = countPlaceNames(db);
    results.cleanup = { placesBefore: beforePlaces, placesAfter: afterPlaces, namesBefore: beforeNames, namesAfter: afterNames, deletedPlaces: beforePlaces - afterPlaces };
    results.actions = actions;
    if (!args.quiet) {
      console.error('place_sources:', results.place_sources);
      console.error('cleanup:', results.cleanup);
      console.error('actions:', results.actions);
    }
  } finally {
    db.close();
  }
}

if (require.main === module) main();
