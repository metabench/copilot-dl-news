#!/usr/bin/env node
'use strict';

/**
 * postgis-explore.js - PostGIS Database Explorer CLI
 *
 * Query and explore the planet1 PostGIS database containing
 * country shapes, admin areas, and geographic boundaries.
 */

const fs = require('fs');
const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getPostgisApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'createPostgisExplorerAccess',
    'createPostgisExplorerClient',
    'normalizePostgisExplorerConfig'
  ];

  for (const name of required) {
    if (typeof dbModule[name] !== 'function') {
      throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
    }
  }

  return dbModule;
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    countries: false,
    country: null,
    adm1: null,
    adm2: null,
    geojson: null,
    stats: false,
    search: null,
    limit: 50,
    simplify: 0.01,
    output: null,
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--countries':
      case '-c':
        opts.countries = true;
        break;
      case '--country':
        opts.country = argv[++i];
        break;
      case '--adm1':
        opts.adm1 = argv[++i];
        break;
      case '--adm2':
        opts.adm2 = argv[++i];
        break;
      case '--geojson':
      case '-g':
        opts.geojson = argv[++i];
        break;
      case '--stats':
      case '-s':
        opts.stats = true;
        break;
      case '--search':
        opts.search = argv[++i];
        break;
      case '--limit':
      case '-l':
        opts.limit = parseInt(argv[++i], 10);
        break;
      case '--simplify':
        opts.simplify = parseFloat(argv[++i]);
        break;
      case '--output':
      case '-o':
        opts.output = argv[++i];
        break;
      case '--json':
      case '-j':
        opts.json = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
📍 PostGIS Explorer - Query the planet1 geographic database

USAGE:
  node tools/dev/postgis-explore.js [OPTIONS]

OPTIONS:
  --countries, -c           List all countries with basic stats
  --country <code>          Get details for a specific country (ISO 2-letter code)
  --adm1 <code>             List ADM1 regions for a country
  --adm2 <code>             List ADM2 regions for a country (or ADM1 if specified)
  --geojson <code>, -g      Export country/region as GeoJSON
  --stats, -s               Show database statistics
  --search <term>           Search places by name
  --limit <n>, -l           Limit results (default: 50)
  --simplify <tolerance>    GeoJSON simplification (default: 0.01)
  --output <file>, -o       Write output to file
  --json, -j                Output as JSON
  --help, -h                Show this help

EXAMPLES:
  node tools/dev/postgis-explore.js --countries
  node tools/dev/postgis-explore.js --country FR
  node tools/dev/postgis-explore.js --adm1 FR
  node tools/dev/postgis-explore.js --geojson GB --output uk.geojson
  node tools/dev/postgis-explore.js --search "London" --limit 20

ENVIRONMENT:
  POSTGIS_HOST      Database host (default: localhost)
  POSTGIS_PORT      Database port (default: 5432)
  POSTGIS_DB        Database name (default: planet1)
  POSTGIS_USER      Database user (default: postgres)
  POSTGIS_PASSWORD  Database password (default: pg1234)
`);
}

function printCountries(rows, opts) {
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`\n🌍 Countries (${rows.length} found)\n`);
  console.log('─'.repeat(85));
  console.log(`${'ISO'.padEnd(5)} ${'Name'.padEnd(35)} ${'Area (km²)'.padStart(18)} ${'Vertices'.padStart(12)} ${'Wikidata'.padStart(12)}`);
  console.log('─'.repeat(85));
  for (const row of rows) {
    const area = row.area_km2 ? Math.round(row.area_km2).toLocaleString() : 'N/A';
    console.log(
      `${(row.iso_a2 || '??').padEnd(5)} ` +
      `${(row.name || 'Unknown').substring(0, 34).padEnd(35)} ` +
      `${area.padStart(18)} ` +
      `${String(row.vertex_count || 0).padStart(12)} ` +
      `${(row.wikidata || '').padStart(12)}`
    );
  }
  console.log('─'.repeat(85));
}

function printCountryDetails(country, code, opts) {
  if (!country) {
    console.error(`❌ Country not found: ${code}`);
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(country, null, 2));
    return;
  }

  console.log(`\n🏳️ ${country.name} (${country.iso_a2})\n`);
  console.log(`  ISO Alpha-2: ${country.iso_a2}`);
  console.log(`  ISO Alpha-3: ${country.iso_a3}`);
  console.log(`  Wikidata:   ${country.wikidata || 'N/A'}`);
  console.log(`  Centroid:   ${country.centroid}`);
  console.log(`  Area:       ${Math.round(country.area_km2 || 0).toLocaleString()} km²`);
  console.log(`  Vertices:   ${(country.vertex_count || 0).toLocaleString()}`);
  console.log('  Bounding Box:');
  console.log(`    West:  ${(country.bbox_west || 0).toFixed(4)}`);
  console.log(`    South: ${(country.bbox_south || 0).toFixed(4)}`);
  console.log(`    East:  ${(country.bbox_east || 0).toFixed(4)}`);
  console.log(`    North: ${(country.bbox_north || 0).toFixed(4)}`);
}

function printAdm1Regions(result, code, opts) {
  if (!result.country) {
    console.error(`❌ Country not found: ${code}`);
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ country: result.country.name, regions: result.regions }, null, 2));
    return;
  }

  console.log(`\n📍 ADM1 Regions in ${result.country.name} (${result.regions.length} found)\n`);
  console.log('─'.repeat(60));
  console.log(`${'Name'.padEnd(40)} ${'Area (km²)'.padStart(15)}`);
  console.log('─'.repeat(60));
  for (const row of result.regions) {
    const area = row.area_km2 ? Math.round(row.area_km2).toLocaleString() : 'N/A';
    console.log(`${(row.name || 'Unknown').padEnd(40)} ${area.padStart(15)}`);
  }
  console.log('─'.repeat(60));
}

function writeOrPrintGeoJson(featureCollection, code, opts) {
  if (!featureCollection) {
    console.error(`❌ Region not found: ${code}`);
    return;
  }

  const output = JSON.stringify(featureCollection, null, 2);
  if (opts.output) {
    fs.writeFileSync(opts.output, output);
    console.log(`✓ Wrote GeoJSON to ${opts.output} (${(output.length / 1024).toFixed(1)} KB)`);
  } else {
    console.log(output);
  }
}

function printStats(stats, opts) {
  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log('\n📊 PostGIS Database Statistics\n');
  console.log('─'.repeat(50));
  console.log(`PostGIS Version: ${stats.postgisVersion}`);
  console.log('─'.repeat(50));
  console.log('\nRecord Counts:');
  for (const [key, value] of Object.entries(stats)) {
    if (key !== 'adminLevelDistribution' && key !== 'postgisVersion') {
      console.log(`  ${key.padEnd(30)} ${value.toLocaleString().padStart(12)}`);
    }
  }
  console.log('\nAdmin Level Distribution:');
  for (const [level, count] of Object.entries(stats.adminLevelDistribution)) {
    console.log(`  ${level.padEnd(15)} ${count.toLocaleString().padStart(12)}`);
  }
  console.log('─'.repeat(50));
}

function printSearchResults(rows, term, opts) {
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`\n🔍 Search Results for "${term}" (${rows.length} found)\n`);
  console.log('─'.repeat(90));
  console.log(`${'Name'.padEnd(35)} ${'Type'.padEnd(15)} ${'Admin Level'.padEnd(12)} ${'Centroid'}`);
  console.log('─'.repeat(90));
  for (const row of rows) {
    const centroid = row.centroid ? row.centroid.replace('POINT(', '').replace(')', '') : 'N/A';
    console.log(
      `${(row.name || 'Unknown').padEnd(35)} ` +
      `${row.type.padEnd(15)} ` +
      `${String(row.admin_level).padEnd(12)} ` +
      `${centroid}`
    );
  }
  console.log('─'.repeat(90));
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    return;
  }

  const api = getPostgisApi();
  const config = api.normalizePostgisExplorerConfig();
  const client = await api.createPostgisExplorerClient(config);
  const access = api.createPostgisExplorerAccess(client);

  try {
    console.log(`✓ Connected to ${config.database}@${config.host}`);

    if (opts.stats) {
      printStats(await access.getStats(), opts);
    } else if (opts.countries) {
      printCountries(await access.listCountries({ limit: opts.limit }), opts);
    } else if (opts.country) {
      printCountryDetails(await access.getCountryDetails(opts.country), opts.country, opts);
    } else if (opts.adm1) {
      printAdm1Regions(await access.listAdm1Regions(opts.adm1, { limit: opts.limit }), opts.adm1, opts);
    } else if (opts.geojson) {
      writeOrPrintGeoJson(await access.getGeoJsonFeatureCollection(opts.geojson, { simplify: opts.simplify }), opts.geojson, opts);
    } else if (opts.search) {
      printSearchResults(await access.searchPlaces(opts.search, { limit: opts.limit }), opts.search, opts);
    } else {
      printHelp();
    }
  } finally {
    if (client && typeof client.end === 'function') {
      await client.end();
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  getPostgisApi,
  printCountries,
  printCountryDetails,
  printAdm1Regions,
  writeOrPrintGeoJson,
  printStats,
  printSearchResults,
  main
};
