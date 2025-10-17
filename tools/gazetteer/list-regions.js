#!/usr/bin/env node
/**
 * list-regions - List regions for a specific country from the gazetteer
 *
 * Usage:
 *   node tools/gazetteer/list-regions.js --country=DE             # List all current regions for Germany
 *   node tools/gazetteer/list-regions.js --country=GB --limit=25  # Limit output to top 25 regions (by chosen sort)
 *   node tools/gazetteer/list-regions.js --country=GB --json      # Emit JSON instead of human-readable output
 *
 * Options:
 *   --country=CODE         ISO 3166-1 alpha-2 country code (required)
 *   --limit=N              Optional maximum number of regions to return
 *   --sort=population      Sort by population descending (default: name ascending)
 *   --json                 Output JSON (default is formatted text)
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');
const { getCountryByCode } = require('../../src/db/sqlite/queries/gazetteer.places');

function parseArgs(argv) {
  const result = {
    json: false,
    sort: 'name'
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
      case 'country':
        if (typeof value === 'string') {
          result.country = value.trim();
        }
        break;
      case 'limit':
        if (value !== true) {
          const parsedLimit = Number(value);
          if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
            result.limit = Math.floor(parsedLimit);
          }
        }
        break;
      case 'sort':
        if (typeof value === 'string' && value.toLowerCase() === 'population') {
          result.sort = 'population';
        }
        break;
      case 'json':
        result.json = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function printUsage() {
  console.log('\nUsage: node tools/gazetteer/list-regions.js --country=CODE [--limit=N] [--sort=population] [--json]\n');
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return value.toLocaleString('en-US');
}

function formatCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return `(${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}

function run() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.country) {
    console.error('Error: --country=CODE is required.');
    printUsage();
    process.exitCode = 1;
    return;
  }

  const countryCode = options.country.toUpperCase();

  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);

  try {
    const country = getCountryByCode(db, countryCode);
    if (!country) {
      console.error(`No country found for code ${countryCode}.`);
      process.exitCode = 1;
      return;
    }

    const params = [countryCode];
    let query = `
      SELECT 
        p.id,
        p.country_code,
        p.lat,
        p.lng,
        p.population,
        p.timezone,
        p.extra,
  p.priority_score,
  p.wikidata_admin_level AS wikidataAdminLevel,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names WHERE place_id = p.id ORDER BY is_preferred DESC, is_official DESC LIMIT 1),
          '(unnamed)'
        ) AS name
      FROM places p
      WHERE p.kind = 'region'
        AND p.status = 'current'
        AND p.country_code = ?
    `;

    const orderClause = options.sort === 'population'
      ? '\n      ORDER BY p.population DESC, name COLLATE NOCASE ASC\n'
      : '\n      ORDER BY name COLLATE NOCASE ASC\n';

    query += orderClause;

    if (typeof options.limit === 'number') {
      query += '      LIMIT ?\n';
      params.push(options.limit);
    }

    const statement = db.prepare(query);
    const rows = statement.all(...params);

    if (options.json) {
      const payload = {
        country: {
          code: country.code,
          name: country.name || country.code,
          population: country.population || null,
          wikidataQid: country.wikidataQid || null
        },
        filters: {
          sort: options.sort,
          limit: options.limit ?? null
        },
        regions: rows.map(row => ({
          id: row.id,
          name: row.name || '(unnamed)',
          population: row.population ?? null,
          coordinates: (typeof row.lat === 'number' && typeof row.lng === 'number') ? { lat: row.lat, lng: row.lng } : null,
          timezone: row.timezone || null,
          wikidataAdminLevel: row.wikidataAdminLevel ?? jsonExtractWikidataAdminLevel(row.extra),
          adminLevel: row.wikidataAdminLevel ?? jsonExtractWikidataAdminLevel(row.extra),
          priorityScore: Number.isFinite(row.priority_score) ? row.priority_score : null
        }))
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`\nRegions for ${country.name || country.code} [${country.code}]\n`);

    if (!rows.length) {
      console.log('No regions recorded in the gazetteer for this country.');
      return;
    }

    rows.forEach((row, index) => {
      const num = `${index + 1}.`.padEnd(5);
      const name = (row.name || '(unnamed)').padEnd(30);
  const level = row.wikidataAdminLevel ?? jsonExtractWikidataAdminLevel(row.extra);
  const levelPart = level != null ? `Wikidata level ${level}` : 'Wikidata level ?';
      const population = formatNumber(row.population) ? `pop ${formatNumber(row.population)}` : null;
      const coords = formatCoordinates(row.lat, row.lng);
      const details = [levelPart, population, coords].filter(Boolean).join(' | ');
      console.log(`${num}${name}${details}`);
    });

    console.log(`\nTotal: ${rows.length} region${rows.length === 1 ? '' : 's'}`);
  } finally {
    db.close();
  }
}

function jsonExtractWikidataAdminLevel(extra) {
  if (!extra) return null;
  try {
    const parsed = JSON.parse(extra);
    if (parsed && typeof parsed.wikidataAdminLevel !== 'undefined') {
      return parsed.wikidataAdminLevel;
    }
    if (parsed && typeof parsed.level !== 'undefined') {
      return parsed.level;
    }
  } catch (_) {
    return null;
  }
  return null;
}

run();
