#!/usr/bin/env node

'use strict';

const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');

function parseArgs(argv) {
  const args = {
    dbPath: null,
    dryRun: true,
    limit: null,
    verbose: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw) continue;

    if (raw === '--help' || raw === '-h') {
      args.help = true;
      continue;
    }

    if (raw === '--apply' || raw === '--no-dry-run') {
      args.dryRun = false;
      continue;
    }

    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (raw === '--verbose' || raw === '-v') {
      args.verbose = true;
      continue;
    }

    if (raw.startsWith('--')) {
      const [flag, value] = raw.includes('=') ? raw.split('=') : [raw, null];
      switch (flag) {
        case '--db':
        case '--db-path':
          args.dbPath = value || argv[++i];
          break;
        case '--limit':
          args.limit = Number(value || argv[++i]);
          break;
        default:
          break;
      }
      continue;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
normalize-country-names — audit and optionally fix canonical country names

Usage:
  node tools/gazetteer/normalize-country-names.js [options]

Options:
  --db PATH        Path to news.db (defaults to data/news.db)
  --limit N        Only display the first N mismatches
  --apply          Update canonical names to the best English variant
  --dry-run        Preview without modifying the database (default)
  --verbose        Print extra diagnostics
  --help           Show this message

Examples:
  node tools/gazetteer/normalize-country-names.js
  node tools/gazetteer/normalize-country-names.js --apply --limit 20
`);
}

function fetchCanonicalRows(db) {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.country_code AS code,
      p.canonical_name_id AS canonicalId,
      cn.name AS canonicalName,
      cn.lang AS canonicalLang,
      (
        SELECT pn.id FROM place_names pn
         WHERE pn.place_id = p.id
           AND pn.lang LIKE 'en%'
         ORDER BY pn.is_preferred DESC, pn.id ASC
         LIMIT 1
      ) AS englishId,
      (
        SELECT pn.name FROM place_names pn
         WHERE pn.place_id = p.id
           AND pn.lang LIKE 'en%'
         ORDER BY pn.is_preferred DESC, pn.id ASC
         LIMIT 1
      ) AS englishName,
      (
        SELECT pn.lang FROM place_names pn
         WHERE pn.place_id = p.id
           AND pn.lang LIKE 'en%'
         ORDER BY pn.is_preferred DESC, pn.id ASC
         LIMIT 1
      ) AS englishLang
    FROM places p
    LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
    WHERE p.kind = 'country'
      AND p.country_code IS NOT NULL
      AND p.status IS NOT 'deprecated'
    ORDER BY p.country_code ASC
  `).all();

  return rows.filter((row) => {
    if (!row.englishName) return false;
    if (!row.canonicalId) return true; // canonical missing
    if (!row.canonicalLang) return true;
    if (!row.canonicalLang.toLowerCase().startsWith('en')) return true;
    if (row.canonicalName === row.englishName) return false;
    return false;
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    showHelp();
    return;
  }

  const dbPath = args.dbPath
    ? path.resolve(args.dbPath)
    : path.join(__dirname, '..', '..', 'data', 'news.db');

  const db = ensureDatabase(dbPath);

  try {
    const mismatches = fetchCanonicalRows(db);
    if (!mismatches.length) {
      console.log('All canonical names already use English variants or lack English alternatives.');
      return;
    }

    const total = mismatches.length;
    const display = Number.isFinite(args.limit) && args.limit >= 0
      ? mismatches.slice(0, args.limit)
      : mismatches;

    console.log(`Found ${total} countries where canonical name is not English despite an English alternative.`);
    if (args.dryRun) {
      console.log('Running in dry-run mode. Use --apply to update canonical names.');
    }

    for (const row of display) {
      console.log(` • ${row.code}: canonical="${row.canonicalName || '(missing)'}" (${row.canonicalLang || 'n/a'}) -> English="${row.englishName}" (${row.englishLang})`);
    }

    if (!args.dryRun) {
      const updateStmt = db.prepare(`
        UPDATE places
           SET canonical_name_id = @englishId
         WHERE id = @placeId
      `);
      const transaction = db.transaction((rows) => {
        for (const row of rows) {
          if (!row.englishId) continue;
          updateStmt.run({ placeId: row.id, englishId: row.englishId });
        }
      });

      transaction(mismatches);
      console.log(`Updated ${mismatches.length} canonical names to their English variants.`);
    }

    if (args.verbose) {
      const unresolved = mismatches.filter((row) => !row.englishId);
      if (unresolved.length) {
        console.log('\nEntries without English alternatives:');
        unresolved.forEach((row) => {
          console.log(` • ${row.code}: canonical="${row.canonicalName || '(missing)'}" (${row.canonicalLang || 'n/a'})`);
        });
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

