#!/usr/bin/env node
/**
 * list-cities - List cities for a specific country from the gazetteer
 *
 * Usage:
 *   node tools/gazetteer/list-cities.js --country=DE             # List all current cities for Germany
 *   node tools/gazetteer/list-cities.js --country=DE --limit=20  # Limit output to top 20 cities (by chosen sort)
 *   node tools/gazetteer/list-cities.js --country=DE --json      # Emit JSON instead of human-readable output
 *
 * Options:
 *   --country=CODE         ISO 3166-1 alpha-2 country code (required)
 *   --limit=N              Optional maximum number of cities to return
 *   --min-population=N     Minimum population filter (e.g. 50000)
 *   --sort=population      Sort by population descending (default: name ascending)
 *   --json                 Output JSON (default is formatted text)
 *
 * Notes:
 *   - Only places with kind="city" and status="current" are included
 *   - City names favor canonical/preferred names from place_names
 *   - Population and coordinate data may be missing for some entries
 */

const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const { getCountryByCode } = require('../../src/data/db/sqlite/queries/gazetteer.places');

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
      case 'min-population':
      case 'minPopulation':
        if (value !== true) {
          const parsedMin = Number(value);
          if (Number.isFinite(parsedMin) && parsedMin >= 0) {
            result.minPopulation = Math.floor(parsedMin);
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
        // Ignore unknown flags
        break;
    }
  }

  return result;
}

function printUsage() {
  console.log(`\nUsage: node tools/gazetteer/list-cities.js --country=CODE [--limit=N] [--min-population=N] [--sort=population] [--json]\n`);
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
        p.wikidata_qid as wikidataQid,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names WHERE place_id = p.id ORDER BY is_preferred DESC, is_official DESC LIMIT 1),
          '(unnamed)'
        ) as name
      FROM places p
      WHERE p.kind = 'city'
        AND p.status = 'current'
        AND p.country_code = ?
    `;

    if (typeof options.minPopulation === 'number') {
      query += '\n        AND p.population IS NOT NULL\n        AND p.population >= ?\n';
      params.push(options.minPopulation);
    }

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
          minPopulation: options.minPopulation ?? null,
          sort: options.sort,
          limit: options.limit ?? null
        },
        cities: rows.map(row => ({
          id: row.id,
          name: row.name || '(unnamed)',
          population: row.population ?? null,
          coordinates: (typeof row.lat === 'number' && typeof row.lng === 'number') ? { lat: row.lat, lng: row.lng } : null,
          timezone: row.timezone || null,
          wikidataQid: row.wikidataQid || null
        }))
      };

      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log();
    console.log(`🏙️  Cities in ${country.name || country.code} (${country.code})`);

    const appliedFilters = [];
    if (typeof options.minPopulation === 'number') {
      appliedFilters.push(`population ≥ ${formatNumber(options.minPopulation)}`);
    }
    if (options.sort === 'population') {
      appliedFilters.push('sorted by population');
    }
    if (typeof options.limit === 'number') {
      appliedFilters.push(`showing top ${options.limit}`);
    }

    if (appliedFilters.length) {
      console.log(`Filters: ${appliedFilters.join(', ')}`);
    }

    console.log(`Total cities returned: ${rows.length}`);
    console.log();

    if (rows.length === 0) {
      console.log('No cities matched the requested filters.');
      console.log();
      return;
    }

    rows.forEach((row, index) => {
      const number = `${index + 1}.`.padEnd(5);
      const name = row.name || '(unnamed)';
      const details = [];
      const formattedPopulation = formatNumber(row.population);
      const coords = formatCoordinates(row.lat, row.lng);

      if (formattedPopulation) {
        details.push(`pop: ${formattedPopulation}`);
      }
      if (row.timezone) {
        details.push(`tz: ${row.timezone}`);
      }
      if (coords) {
        details.push(coords);
      }

      const suffix = details.length ? ` — ${details.join(' • ')}` : '';
      console.log(`${number}${name}${suffix}`);
    });

    console.log();
  } finally {
    db.close();
  }
}

run();

