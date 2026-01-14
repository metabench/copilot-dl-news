#!/usr/bin/env node
/**
 * gazetteer-summary - Produce a summary table of countries with city and region counts.
 *
 * Usage:
 *   node tools/gazetteer/gazetteer-summary.js                     # Uses data/news.db by default
 *   node tools/gazetteer/gazetteer-summary.js --db=./path/to.db   # Specify a different database
 *   node tools/gazetteer/gazetteer-summary.js --json              # Emit JSON instead of a formatted table
 */

const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');

function parseArgs(argv) {
  const options = {
    json: false,
    dbPath: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const withoutPrefix = arg.slice(2);
    let key;
    let value;

    if (withoutPrefix.includes('=')) {
      const [rawKey, ...rest] = withoutPrefix.split('=');
      key = rawKey;
      value = rest.join('=');
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }

    switch (key) {
      case 'db':
        if (typeof value === 'string') {
          options.dbPath = value.trim();
        }
        break;
      case 'json':
        options.json = true;
        break;
      default:
        // Ignore unknown flags
        break;
    }
  }

  return options;
}

function formatTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'No countries found.';
  }

  const headers = ['Country', 'Code', 'Cities', 'Regions'];
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    widths[0] = Math.max(widths[0], String(row.name).length);
    widths[1] = Math.max(widths[1], String(row.code).length);
    widths[2] = Math.max(widths[2], String(row.cities).length);
    widths[3] = Math.max(widths[3], String(row.regions).length);
  }

  const pad = (value, width) => {
    const str = String(value);
    if (str.length >= width) return str;
    return str + ' '.repeat(width - str.length);
  };

  const lines = [];
  lines.push(`${pad(headers[0], widths[0])}  ${pad(headers[1], widths[1])}  ${pad(headers[2], widths[2])}  ${pad(headers[3], widths[3])}`);
  lines.push(`${'-'.repeat(widths[0])}  ${'-'.repeat(widths[1])}  ${'-'.repeat(widths[2])}  ${'-'.repeat(widths[3])}`);

  for (const row of rows) {
    lines.push(
      `${pad(row.name, widths[0])}  ${pad(row.code, widths[1])}  ${pad(row.cities, widths[2])}  ${pad(row.regions, widths[3])}`
    );
  }

  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = options.dbPath
    ? path.resolve(process.cwd(), options.dbPath)
    : path.join(__dirname, '..', '..', 'data', 'news.db');

  let db;
  try {
    db = ensureDatabase(dbPath);
  } catch (err) {
    console.error(`Failed to open database at ${dbPath}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    const countriesStmt = db.prepare(`
      SELECT 
        p.country_code AS code,
        COALESCE(pn.name, p.country_code) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
      WHERE p.kind = 'country'
        AND p.status = 'current'
      ORDER BY name COLLATE NOCASE ASC
    `);
    const cityCountStmt = db.prepare(`
      SELECT COUNT(*) AS count
      FROM places
      WHERE kind = 'city'
        AND status = 'current'
        AND country_code = ?
    `);
    const regionCountStmt = db.prepare(`
      SELECT COUNT(*) AS count
      FROM places
      WHERE kind = 'region'
        AND status = 'current'
        AND country_code = ?
    `);

    const countries = countriesStmt.all();
    const summaryRows = countries.map((country) => {
      const cityCount = cityCountStmt.get(country.code) || { count: 0 };
      const regionCount = regionCountStmt.get(country.code) || { count: 0 };
      return {
        name: country.name || country.code,
        code: country.code,
        cities: cityCount.count || 0,
        regions: regionCount.count || 0
      };
    });

    if (options.json) {
      const payload = {
        dbPath,
        countries: summaryRows
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`Database: ${dbPath}`);
    console.log(formatTable(summaryRows));
  } catch (err) {
    console.error(`Failed to produce gazetteer summary: ${err.message}`);
    process.exitCode = 1;
  } finally {
    try {
      db.close();
    } catch (_) {
      // Ignore
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

