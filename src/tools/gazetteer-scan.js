#!/usr/bin/env node

/*
  gazetteer-scan.js
  - CLI tool for querying and exploring the gazetteer database.
  - Designed for AI agents and developers to answer geography questions.
  
  Usage:
    node src/tools/gazetteer-scan.js --search "Paris"
    node src/tools/gazetteer-scan.js --lookup 12345
    node src/tools/gazetteer-scan.js --country FR --kind city
    node src/tools/gazetteer-scan.js --stats
*/

const path = require('path');
const { ensureDb } = require('../data/db/sqlite');
const { findProjectRoot } = require('../shared/utils/project-root');
const { CliArgumentParser } = require('../shared/utils/CliArgumentParser');
const { GazetteerTelemetry } = require('./gazetteer/GazetteerTelemetry');
const { searchPlacesByName, getPlaceDetails } = require('../data/db/sqlite/v1/queries/gazetteer.search');
const { 
  getPlaceCountByKind, 
  getPlacesByCountryAndKind,
  getCountryByCode
} = require('../data/db/sqlite/v1/queries/gazetteer.places');

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'gazetteer-scan',
    'Query and explore the gazetteer database'
  );

  parser
    .add('--db <path>', 'Path to SQLite database', 'data/news.db')
    .add('--search <term>', 'Search for places by name', '')
    .add('--lookup <id>', 'Get full details for a place ID', '', 'number')
    .add('--country <code/name>', 'Filter by country code (ISO alpha-2)', '')
    .add('--kind <kind>', 'Filter by place kind (country, region, city)', '')
    .add('--limit <number>', 'Limit number of results', 50, 'number')
    .add('--stats', 'Show database statistics', false, 'boolean')
    .add('--verbose', 'Enable verbose logging', false, 'boolean')
    .add('--json', 'Output structured JSON', false, 'boolean');

  return parser.parse(argv);
}

function resolvePath(projectRoot, input, defaultRelative) {
  const candidate = input && input.length ? input : defaultRelative;
  if (!candidate) return null;
  return path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
}

(async () => {
  let options;
  try {
    options = parseCliArgs(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const projectRoot = findProjectRoot(__dirname);
  const dbPath = resolvePath(projectRoot, options.db, 'data/news.db');
  
  const telemetry = new GazetteerTelemetry({
    jsonMode: options.json,
    verbose: options.verbose,
    quiet: false
  });

  const db = ensureDb(dbPath);

  try {
    // Mode: Stats
    if (options.stats) {
      const stats = {
        countries: getPlaceCountByKind(db, 'country'),
        regions: getPlaceCountByKind(db, 'region'),
        cities: getPlaceCountByKind(db, 'city'),
        supranational: getPlaceCountByKind(db, 'supranational')
      };
      
      if (options.json) {
        console.log(JSON.stringify({ type: 'stats', stats }));
      } else {
        telemetry.section('Gazetteer Statistics');
        telemetry.table([
          { Kind: 'Countries', Count: stats.countries },
          { Kind: 'Regions', Count: stats.regions },
          { Kind: 'Cities', Count: stats.cities },
          { Kind: 'Supranational', Count: stats.supranational }
        ], { columns: ['Kind', 'Count'] });
      }
      return;
    }

    // Mode: Lookup
    if (options.lookup) {
      const details = getPlaceDetails(db, options.lookup);
      if (!details) {
        telemetry.error(`Place not found: ${options.lookup}`);
        process.exitCode = 1;
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({ type: 'place_details', place: details }));
      } else {
        telemetry.section(`Place Details: ${details.name} (ID: ${details.id})`);
        telemetry.info(`Kind: ${details.kind}`);
        telemetry.info(`Country: ${details.country_code}`);
        telemetry.info(`Population: ${details.population}`);
        telemetry.info(`Coordinates: ${details.lat}, ${details.lng}`);
        
        if (details.names.length) {
          telemetry.section('Names');
          telemetry.table(details.names.map(n => ({
            Name: n.name,
            Lang: n.lang,
            Kind: n.name_kind,
            Flags: [n.is_preferred ? 'Pref' : '', n.is_official ? 'Off' : ''].filter(Boolean).join(',')
          })), { columns: ['Name', 'Lang', 'Kind', 'Flags'] });
        }

        if (details.parents.length) {
          telemetry.section('Hierarchy (Parents)');
          telemetry.table(details.parents.map(p => ({
            ID: p.parent_id,
            Name: p.name,
            Kind: p.kind,
            Role: p.role
          })), { columns: ['ID', 'Name', 'Kind', 'Role'] });
        }
        
        if (details.attributes.length) {
          telemetry.section('Attributes');
          telemetry.table(details.attributes.map(a => ({
            Attr: a.attr,
            Value: String(a.value).substring(0, 50),
            Source: a.source
          })), { columns: ['Attr', 'Value', 'Source'] });
        }
      }
      return;
    }

    // Mode: Search
    if (options.search) {
      const results = searchPlacesByName(db, options.search, {
        limit: options.limit,
        kind: options.kind,
        countryCode: options.country ? options.country.toUpperCase() : undefined
      });

      if (options.json) {
        console.log(JSON.stringify({ type: 'search_results', count: results.length, results }));
      } else {
        telemetry.section(`Search Results for "${options.search}"`);
        if (results.length === 0) {
          telemetry.info('No results found.');
        } else {
          telemetry.table(results.map(r => ({
            ID: r.id,
            Name: r.canonical_name,
            Match: r.matched_name !== r.canonical_name ? `(${r.matched_name})` : '',
            Kind: r.kind,
            CC: r.country_code,
            Pop: r.population
          })), { columns: ['ID', 'Name', 'Match', 'Kind', 'CC', 'Pop'] });
        }
      }
      return;
    }

    // Mode: List by Country
    if (options.country) {
      const cc = options.country.toUpperCase();
      const country = getCountryByCode(db, cc);
      
      if (!country) {
        telemetry.error(`Country not found: ${cc}`);
        process.exitCode = 1;
        return;
      }

      const kind = options.kind || 'city';
      const places = getPlacesByCountryAndKind(db, cc, kind);
      const limitedPlaces = places.slice(0, options.limit);

      if (options.json) {
        console.log(JSON.stringify({ type: 'country_places', country: country.name, kind, count: places.length, results: limitedPlaces }));
      } else {
        telemetry.section(`${kind}s in ${country.name} (${cc})`);
        telemetry.info(`Total found: ${places.length} (showing top ${limitedPlaces.length})`);
        telemetry.table(limitedPlaces.map(p => ({
          ID: p.id,
          Name: p.name,
          ADM1: p.adm1_code || '',
          Pop: p.population
        })), { columns: ['ID', 'Name', 'ADM1', 'Pop'] });
      }
      return;
    }

    // Default: Help
    telemetry.info('Use --search, --lookup, --country, or --stats to query the gazetteer.');
    telemetry.info('Example: node src/tools/gazetteer-scan.js --search "Paris"');

  } catch (err) {
    telemetry.error(`Operation failed: ${err.message}`, err);
    process.exitCode = 1;
  } finally {
    try { db.close(); } catch (_) {}
  }
})();
