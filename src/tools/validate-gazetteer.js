#!/usr/bin/env node
/**
 * Validate gazetteer data quality with beautiful formatted output.
 * 
 * Usage:
 *   node validate-gazetteer.js                    (default summary)
 *   node validate-gazetteer.js --details          (detailed issue lists)
 *   node validate-gazetteer.js --json             (JSON output)
 *   node validate-gazetteer.js --db=custom.db     (custom database)
 */

const path = require('path');
const { ensureDb, openDbReadOnly } = require('../db/sqlite');
const { validateGazetteer } = require('../db/sqlite/tools/gazetteerQA');
const { CliFormatter, ICONS } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');

const fmt = new CliFormatter();

/**
 * Parse command-line arguments using CliArgumentParser
 */
function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'validate-gazetteer',
    'Validate gazetteer data quality and consistency'
  );

  parser
    .add('--db <path>', 'Path to gazetteer database', 'data/gazetteer.db')
    .add('--details', 'Print detailed issue lists', false, 'boolean')
    .add('--json', 'Output as JSON instead of formatted text', false, 'boolean');

  return parser.parse(argv);
}

/**
 * Print human-readable formatted output
 */
function printHuman(summary, details) {
  fmt.header('Gazetteer Validation Report');

  fmt.section('Issues Summary');
  fmt.stat('Nameless places', details.nameless.length, 'number');
  fmt.stat('Bad canonical refs', details.badCanonical.length, 'number');
  fmt.stat('Regions missing codes', details.badRegions.length, 'number');
  fmt.stat('Countries invalid/missing code', details.badCountries.length, 'number');
  fmt.stat('Orphan hierarchy edges', details.orphanEdges.length, 'number');
  fmt.stat('Two-node cycles', details.twoNodeCycles.length, 'number');
  fmt.stat('Long cycles (depth ≤ 20)', details.longCycles.length, 'number');
  fmt.stat('Duplicate names', details.dupNames.length, 'number');
  fmt.stat('Missing normalized', details.missingNormalized.length, 'number');
  fmt.stat('Duplicate external IDs', details.dupExternalIds.length, 'number');

  fmt.blank();
  const totalIssues = details.nameless.length +
    details.badCanonical.length +
    details.badRegions.length +
    details.badCountries.length +
    details.orphanEdges.length +
    details.twoNodeCycles.length +
    details.longCycles.length +
    details.dupNames.length +
    details.missingNormalized.length +
    details.dupExternalIds.length;

  if (totalIssues === 0) {
    fmt.success('All validations passed!');
  } else {
    fmt.warn(`Found ${totalIssues} total issues`);
    fmt.info('Run with --details to see full issue lists');
  }

  fmt.footer();
}

/**
 * Print detailed issue lists
 */
function printDetails(details) {
  const sections = [
    ['Nameless places', details.nameless],
    ['Bad canonical refs', details.badCanonical],
    ['Regions missing codes', details.badRegions],
    ['Countries missing/invalid code', details.badCountries],
    ['Orphan hierarchy edges', details.orphanEdges],
    ['Two-node cycles', details.twoNodeCycles],
    ['Long cycles (depth≤20)', details.longCycles],
    ['Duplicate names (by norm/lang/kind)', details.dupNames],
    ['Missing normalized', details.missingNormalized],
    ['External IDs linked to >1 place', details.dupExternalIds],
  ];

  for (const [label, arr] of sections) {
    if (!arr || arr.length === 0) continue;

    fmt.section(label);
    fmt.info(`${arr.length} total`);

    // Show first 10, summarize if more
    const showing = Math.min(10, arr.length);
    for (const row of arr.slice(0, showing)) {
      console.log(`  ${fmt.ICONS.bullet} ${JSON.stringify(row)}`);
    }

    if (arr.length > showing) {
      fmt.info(`... and ${arr.length - showing} more`);
    }
    fmt.blank();
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db;

  // Prefer read-only for validation speed; fallback to ensureDb if needed
  let db;
  try {
    db = openDbReadOnly(dbPath);
  } catch (_) {
    db = ensureDb(dbPath);
  }

  try {
    const { details, summary } = validateGazetteer(db);

    if (args.json) {
      console.log(JSON.stringify({
        summary,
        details: args.details ? details : undefined
      }, null, 2));
    } else {
      printHuman(summary, details);
      if (args.details) {
        fmt.blank();
        printDetails(details);
      }
    }
  } finally {
    try { db.close(); } catch (_) {}
  }
}

if (require.main === module) main();
