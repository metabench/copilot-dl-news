#!/usr/bin/env node
// Validate gazetteer data quality: prints a summary and optionally details.

const path = require('path');
const { ensureDb, openDbReadOnly } = require('../ensure_db');
const { validateGazetteer } = require('./gazetteer_qa');

function parseArgs(argv) {
  const args = { details: false, json: false };
  for (const a of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2]; else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  // normalize booleans
  args.details = args.details === true || String(args.details).toLowerCase() === '1' || String(args.details).toLowerCase() === 'true';
  args.json = args.json === true || String(args.json).toLowerCase() === '1' || String(args.json).toLowerCase() === 'true';
  return args;
}

// Validation moved to shared module

function printHuman(summary, details) {
  const lines = [];
  lines.push(`# Gazetteer validation`);
  const add = (label, arr) => lines.push(`${label}: ${arr.length}`);
  add('Nameless places', details.nameless);
  add('Bad canonical refs', details.badCanonical);
  add('Regions missing codes', details.badRegions);
  add('Countries missing/invalid code', details.badCountries);
  add('Orphan hierarchy edges', details.orphanEdges);
  add('Two-node cycles', details.twoNodeCycles);
  add('Long cycles (depth<=20)', details.longCycles);
  add('Duplicate names (by norm/lang/kind)', details.dupNames);
  add('Missing normalized', details.missingNormalized);
  add('External IDs linked to >1 place', details.dupExternalIds);
  console.log(lines.join('\n'));
}

function printDetails(details) {
  const sections = [
    ['Nameless places', details.nameless],
    ['Bad canonical refs', details.badCanonical],
    ['Regions missing codes', details.badRegions],
    ['Countries missing/invalid code', details.badCountries],
    ['Orphan hierarchy edges', details.orphanEdges],
    ['Two-node cycles', details.twoNodeCycles],
    ['Long cycles (depth<=20)', details.longCycles],
    ['Duplicate names (by norm/lang/kind)', details.dupNames],
    ['Missing normalized', details.missingNormalized],
    ['External IDs linked to >1 place', details.dupExternalIds],
  ];
  for (const [label, arr] of sections) {
    if (!arr || arr.length === 0) continue;
    console.log(`\n## ${label}`);
    for (const row of arr.slice(0, 1000)) {
      console.log(JSON.stringify(row));
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db;
  // Prefer read-only for validation speed; if file is missing and caller passed --db, fallback to ensureDb
  let db;
  try { db = openDbReadOnly(dbPath); } catch (_) { db = ensureDb(dbPath); }
  try {
    const { details, summary } = validateGazetteer(db);
    if (args.json) {
      console.log(JSON.stringify({ summary, details: args.details ? details : undefined }, null, 2));
    } else {
      printHuman(summary, details);
      if (args.details) printDetails(details);
    }
  } finally {
    try { db.close(); } catch (_) {}
  }
}

if (require.main === module) main();
