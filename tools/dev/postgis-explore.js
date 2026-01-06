#!/usr/bin/env node
/**
 * postgis-explore.js — PostGIS Database Explorer CLI
 * 
 * Query and explore the planet1 PostGIS database containing
 * country shapes, admin areas, and geographic boundaries.
 * 
 * Usage:
 *   node tools/dev/postgis-explore.js --countries           # List all countries
 *   node tools/dev/postgis-explore.js --country FR          # Get France details
 *   node tools/dev/postgis-explore.js --adm1 FR             # Get France ADM1 regions
 *   node tools/dev/postgis-explore.js --geojson FR          # Export France as GeoJSON
 *   node tools/dev/postgis-explore.js --stats               # Database statistics
 *   node tools/dev/postgis-explore.js --search "London"     # Search places by name
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const DB_CONFIG = {
  host: process.env.POSTGIS_HOST || 'localhost',
  port: process.env.POSTGIS_PORT || 5432,
  database: process.env.POSTGIS_DB || 'planet1',
  user: process.env.POSTGIS_USER || 'postgres',
  password: process.env.POSTGIS_PASSWORD || 'pg1234'
};

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    countries: false,
    country: null,
    adm1: null,
    adm2: null,
    geojson: null,
    stats: false,
    search: null,
    limit: 50,
    simplify: 0.01,  // Simplification tolerance for GeoJSON
    output: null,
    json: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--countries':
      case '-c':
        opts.countries = true;
        break;
      case '--country':
        opts.country = args[++i];
        break;
      case '--adm1':
        opts.adm1 = args[++i];
        break;
      case '--adm2':
        opts.adm2 = args[++i];
        break;
      case '--geojson':
      case '-g':
        opts.geojson = args[++i];
        break;
      case '--stats':
      case '-s':
        opts.stats = true;
        break;
      case '--search':
        opts.search = args[++i];
        break;
      case '--limit':
      case '-l':
        opts.limit = parseInt(args[++i], 10);
        break;
      case '--simplify':
        opts.simplify = parseFloat(args[++i]);
        break;
      case '--output':
      case '-o':
        opts.output = args[++i];
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
📍 PostGIS Explorer — Query the planet1 geographic database

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
  # List all countries
  node tools/dev/postgis-explore.js --countries

  # Get France details
  node tools/dev/postgis-explore.js --country FR

  # List French regions
  node tools/dev/postgis-explore.js --adm1 FR

  # Export UK as GeoJSON
  node tools/dev/postgis-explore.js --geojson GB --output uk.geojson

  # Search for London
  node tools/dev/postgis-explore.js --search "London" --limit 20

ENVIRONMENT:
  POSTGIS_HOST      Database host (default: localhost)
  POSTGIS_PORT      Database port (default: 5432)
  POSTGIS_DB        Database name (default: planet1)
  POSTGIS_USER      Database user (default: postgres)
  POSTGIS_PASSWORD  Database password (default: pg1234)
`);
}

async function getClient() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

async function listCountries(client, opts) {
  // Countries view has: key, name, iso_a2, iso_a3, wikidata, area_km2, geom_wgs84
  const result = await client.query(`
    SELECT 
      name,
      iso_a2,
      iso_a3,
      wikidata,
      area_km2,
      ST_NPoints(geom_wgs84) as vertex_count
    FROM countries
    WHERE iso_a2 IS NOT NULL AND iso_a2 != ''
    ORDER BY area_km2 DESC NULLS LAST
    LIMIT $1
  `, [opts.limit]);

  if (opts.json) {
    console.log(JSON.stringify(result.rows, null, 2));
  } else {
    console.log(`\n🌍 Countries (${result.rows.length} found)\n`);
    console.log('─'.repeat(85));
    console.log(`${'ISO'.padEnd(5)} ${'Name'.padEnd(35)} ${'Area (km²)'.padStart(18)} ${'Vertices'.padStart(12)} ${'Wikidata'.padStart(12)}`);
    console.log('─'.repeat(85));
    for (const row of result.rows) {
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

  return result.rows;
}

async function getCountryDetails(client, countryCode, opts) {
  // Try to find by ISO code first (exact match), then by name
  const result = await client.query(`
    SELECT 
      name,
      iso_a2,
      iso_a3,
      wikidata,
      area_km2,
      ST_AsText(ST_Centroid(geom_wgs84)) as centroid,
      ST_NPoints(geom_wgs84) as vertex_count,
      ST_XMin(geom_wgs84) as bbox_west,
      ST_YMin(geom_wgs84) as bbox_south,
      ST_XMax(geom_wgs84) as bbox_east,
      ST_YMax(geom_wgs84) as bbox_north
    FROM countries
    WHERE UPPER(iso_a2) = UPPER($1) 
       OR UPPER(iso_a3) = UPPER($1)
       OR name ILIKE $2
    ORDER BY 
      CASE WHEN UPPER(iso_a2) = UPPER($1) THEN 0
           WHEN UPPER(iso_a3) = UPPER($1) THEN 1
           ELSE 2 END
    LIMIT 1
  `, [countryCode, `%${countryCode}%`]);

  if (result.rows.length === 0) {
    console.error(`❌ Country not found: ${countryCode}`);
    return null;
  }

  const country = result.rows[0];

  if (opts.json) {
    console.log(JSON.stringify(country, null, 2));
  } else {
    console.log(`\n🏳️ ${country.name} (${country.iso_a2})\n`);
    console.log(`  ISO Alpha-2: ${country.iso_a2}`);
    console.log(`  ISO Alpha-3: ${country.iso_a3}`);
    console.log(`  Wikidata:   ${country.wikidata || 'N/A'}`);
    console.log(`  Centroid:   ${country.centroid}`);
    console.log(`  Area:       ${Math.round(country.area_km2 || 0).toLocaleString()} km²`);
    console.log(`  Vertices:   ${(country.vertex_count || 0).toLocaleString()}`);
    console.log(`  Bounding Box:`);
    console.log(`    West:  ${(country.bbox_west || 0).toFixed(4)}`);
    console.log(`    South: ${(country.bbox_south || 0).toFixed(4)}`);
    console.log(`    East:  ${(country.bbox_east || 0).toFixed(4)}`);
    console.log(`    North: ${(country.bbox_north || 0).toFixed(4)}`);
  }

  return country;
}

async function listAdm1Regions(client, countryCode, opts) {
  // First find the country by ISO code or name
  const countryResult = await client.query(`
    SELECT name, iso_a2, geom_wgs84
    FROM countries
    WHERE UPPER(iso_a2) = $1 
       OR UPPER(iso_a3) = $1
       OR UPPER(name) LIKE $2 
       OR name ILIKE $3
    ORDER BY CASE WHEN UPPER(iso_a2) = $1 OR UPPER(iso_a3) = $1 THEN 0 ELSE 1 END
    LIMIT 1
  `, [countryCode.toUpperCase(), `%${countryCode.toUpperCase()}%`, `%${countryCode}%`]);

  if (countryResult.rows.length === 0) {
    console.error(`❌ Country not found: ${countryCode}`);
    return [];
  }

  const country = countryResult.rows[0];

  // Find ADM1 regions within the country
  // Note: geom_wgs84 is SRID 4326, admin_areas.way is SRID 3857 - must transform
  // Use ST_Contains with centroid to exclude cross-border regions (e.g., Alaska showing up for Canada)
  const result = await client.query(`
    SELECT 
      a.osm_id,
      a.name,
      a.admin_level,
      ST_Area(ST_Transform(a.way, 4326)::geography) / 1000000 as area_km2
    FROM admin_areas a
    WHERE a.admin_level = 4
      AND ST_Contains(ST_Transform($1::geometry, 3857), ST_Centroid(a.way))
      AND a.name IS NOT NULL
      AND a.name != ''
    ORDER BY a.name
    LIMIT $2
  `, [country.geom_wgs84, opts.limit]);

  if (opts.json) {
    console.log(JSON.stringify({ country: country.name, regions: result.rows }, null, 2));
  } else {
    console.log(`\n📍 ADM1 Regions in ${country.name} (${result.rows.length} found)\n`);
    console.log('─'.repeat(60));
    console.log(`${'Name'.padEnd(40)} ${'Area (km²)'.padStart(15)}`);
    console.log('─'.repeat(60));
    for (const row of result.rows) {
      const area = row.area_km2 ? Math.round(row.area_km2).toLocaleString() : 'N/A';
      console.log(`${(row.name || 'Unknown').padEnd(40)} ${area.padStart(15)}`);
    }
    console.log('─'.repeat(60));
  }

  return result.rows;
}

async function exportGeoJSON(client, code, opts) {
  // Try countries first by ISO code
  let result = await client.query(`
    SELECT 
      name,
      iso_a2,
      iso_a3,
      wikidata,
      ST_AsGeoJSON(ST_Simplify(geom_wgs84, $2)) as geojson
    FROM countries
    WHERE UPPER(iso_a2) = UPPER($1) 
       OR UPPER(iso_a3) = UPPER($1)
       OR name ILIKE $3
    LIMIT 1
  `, [code, opts.simplify, `%${code}%`]);

  if (result.rows.length === 0) {
    // Try admin_areas
    result = await client.query(`
      SELECT 
        osm_id,
        name,
        admin_level,
        ST_AsGeoJSON(ST_Simplify(way, $2)) as geojson
      FROM admin_areas
      WHERE name ILIKE $1
      LIMIT 1
    `, [`%${code}%`, opts.simplify]);
  }

  if (result.rows.length === 0) {
    console.error(`❌ Region not found: ${code}`);
    return null;
  }

  const row = result.rows[0];
  const feature = {
    type: 'Feature',
    properties: {
      name: row.name,
      iso_a2: row.iso_a2 || null,
      iso_a3: row.iso_a3 || null,
      wikidata: row.wikidata || null,
      osm_id: row.osm_id || null,
      admin_level: row.admin_level || null
    },
    geometry: JSON.parse(row.geojson)
  };

  const featureCollection = {
    type: 'FeatureCollection',
    features: [feature]
  };

  const output = JSON.stringify(featureCollection, null, 2);

  if (opts.output) {
    fs.writeFileSync(opts.output, output);
    console.log(`✓ Wrote GeoJSON to ${opts.output} (${(output.length / 1024).toFixed(1)} KB)`);
  } else {
    console.log(output);
  }

  return featureCollection;
}

async function showStats(client, opts) {
  const queries = [
    { name: 'Countries', query: 'SELECT COUNT(*) as cnt FROM countries' },
    { name: 'Admin Areas (total)', query: 'SELECT COUNT(*) as cnt FROM admin_areas' },
    { name: 'Country Admin Areas', query: 'SELECT COUNT(*) as cnt FROM country_admin_areas' },
    { name: 'Sub-Country Admin Areas', query: 'SELECT COUNT(*) as cnt FROM sub_country_admin_areas' },
  ];

  const stats = {};
  for (const q of queries) {
    const result = await client.query(q.query);
    stats[q.name] = parseInt(result.rows[0].cnt, 10);
  }

  // Get admin level distribution
  const levelResult = await client.query(`
    SELECT admin_level, COUNT(*) as cnt
    FROM admin_areas
    GROUP BY admin_level
    ORDER BY admin_level
  `);
  stats.adminLevelDistribution = levelResult.rows.reduce((acc, row) => {
    acc[`Level ${row.admin_level}`] = parseInt(row.cnt, 10);
    return acc;
  }, {});

  // Get PostGIS version
  const versionResult = await client.query(`SELECT PostGIS_Version() as version`);
  stats.postgisVersion = versionResult.rows[0].version;

  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(`\n📊 PostGIS Database Statistics\n`);
    console.log('─'.repeat(50));
    console.log(`PostGIS Version: ${stats.postgisVersion}`);
    console.log('─'.repeat(50));
    console.log(`\nRecord Counts:`);
    for (const [key, value] of Object.entries(stats)) {
      if (key !== 'adminLevelDistribution' && key !== 'postgisVersion') {
        console.log(`  ${key.padEnd(30)} ${value.toLocaleString().padStart(12)}`);
      }
    }
    console.log(`\nAdmin Level Distribution:`);
    for (const [level, count] of Object.entries(stats.adminLevelDistribution)) {
      console.log(`  ${level.padEnd(15)} ${count.toLocaleString().padStart(12)}`);
    }
    console.log('─'.repeat(50));
  }

  return stats;
}

async function searchPlaces(client, term, opts) {
  const result = await client.query(`
    SELECT 
      osm_id,
      name,
      admin_level,
      CASE 
        WHEN admin_level = 2 THEN 'Country'
        WHEN admin_level = 4 THEN 'ADM1/State'
        WHEN admin_level = 6 THEN 'ADM2/County'
        WHEN admin_level = 8 THEN 'City/Town'
        ELSE 'Other'
      END as type,
      ST_AsText(ST_Centroid(way)) as centroid
    FROM admin_areas
    WHERE name ILIKE $1
    ORDER BY admin_level, name
    LIMIT $2
  `, [`%${term}%`, opts.limit]);

  if (opts.json) {
    console.log(JSON.stringify(result.rows, null, 2));
  } else {
    console.log(`\n🔍 Search Results for "${term}" (${result.rows.length} found)\n`);
    console.log('─'.repeat(90));
    console.log(`${'Name'.padEnd(35)} ${'Type'.padEnd(15)} ${'Admin Level'.padEnd(12)} ${'Centroid'}`);
    console.log('─'.repeat(90));
    for (const row of result.rows) {
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

  return result.rows;
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  let client;
  try {
    client = await getClient();
    console.log(`✓ Connected to ${DB_CONFIG.database}@${DB_CONFIG.host}`);

    if (opts.stats) {
      await showStats(client, opts);
    } else if (opts.countries) {
      await listCountries(client, opts);
    } else if (opts.country) {
      await getCountryDetails(client, opts.country, opts);
    } else if (opts.adm1) {
      await listAdm1Regions(client, opts.adm1, opts);
    } else if (opts.geojson) {
      await exportGeoJSON(client, opts.geojson, opts);
    } else if (opts.search) {
      await searchPlaces(client, opts.search, opts);
    } else {
      printHelp();
    }

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
