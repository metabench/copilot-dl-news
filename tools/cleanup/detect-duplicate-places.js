#!/usr/bin/env node

/**
 * detect-duplicate-places.js - Detect duplicate places in gazetteer database
 *
 * Detects multiple types of duplicates:
 * 1. Same Wikidata QID (most reliable)
 * 2. Same OSM ID + type combination
 * 3. Same external IDs (geonames, osm, wikidata)
 * 4. Coordinate proximity (< threshold degrees)
 * 5. Same normalized names in same country/kind
 *
 * Usage:
 *   node tools/detect-duplicate-places.js                    # Detect all types
 *   node tools/detect-duplicate-places.js --type=wikidata    # Only Wikidata duplicates
 *   node tools/detect-duplicate-places.js --type=osm         # Only OSM duplicates
 *   node tools/detect-duplicate-places.js --type=external    # Only external ID duplicates
 *   node tools/detect-duplicate-places.js --type=coords      # Only coordinate proximity
 *   node tools/detect-duplicate-places.js --type=names       # Only name-based duplicates
 *   node tools/detect-duplicate-places.js --country=US       # Filter by country
 *   node tools/detect-duplicate-places.js --kind=city        # Filter by kind
 *   node tools/detect-duplicate-places.js --proximity=0.1    # Adjust proximity threshold
 *   node tools/detect-duplicate-places.js --limit=50         # Limit results per type
 *
 * Examples:
 *   # Quick overview of all duplicate types
 *   node tools/detect-duplicate-places.js --limit=10
 *
 *   # Focus on Wikidata duplicates in cities
 *   node tools/detect-duplicate-places.js --type=wikidata --kind=city
 *
 *   # Check coordinate duplicates with larger threshold
 *   node tools/detect-duplicate-places.js --type=coords --proximity=0.2
 */

const { ensureDatabase } = require('../src/data/db/sqlite');
const path = require('path');
const {
  findWikidataDuplicates,
  findOSMDuplicates,
  findExternalIDDupes,
  findPlacesWithCoords,
  findNameDuplicates,
  getTotalPlacesCount
} = require('../src/data/db/sqlite/v1/queries/gazetteer.duplicates');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

const typeFilter = getArg('type', null);
const countryFilter = getArg('country', null);
const kindFilter = getArg('kind', null);
const proximityThreshold = parseFloat(getArg('proximity', '0.05')); // degrees (~5.5km at equator)
const resultLimit = parseInt(getArg('limit', '100'));

const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Detecting duplicate places in gazetteer database...\n');

// Build base WHERE conditions
let whereConditions = [];
if (countryFilter) whereConditions.push(`p.country_code = '${countryFilter}'`);
if (kindFilter) whereConditions.push(`p.kind = '${kindFilter}'`);
const baseWhere = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

const results = {
  wikidata: [],
  osm: [],
  external: [],
  coords: [],
  names: []
};

let totalDuplicates = 0;

// 1. Wikidata QID duplicates (most reliable)
if (!typeFilter || typeFilter === 'wikidata') {
  console.log('📊 Checking Wikidata QID duplicates...');

  const wikidataDups = findWikidataDuplicates(db, baseWhere, resultLimit);
  results.wikidata = wikidataDups;
  totalDuplicates += wikidataDups.length;

  console.log(`  Found ${wikidataDups.length} Wikidata QID duplicate groups\n`);
}

// 2. OSM ID + type duplicates
if (!typeFilter || typeFilter === 'osm') {
  console.log('🗺️  Checking OSM ID duplicates...');

  const osmDups = findOSMDuplicates(db, baseWhere, resultLimit);
  results.osm = osmDups;
  totalDuplicates += osmDups.length;

  console.log(`  Found ${osmDups.length} OSM ID duplicate groups\n`);
}

// 3. External ID duplicates
if (!typeFilter || typeFilter === 'external') {
  console.log('🔗 Checking external ID duplicates...');

  const externalWhere = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ').replace(/p\./g, 'p.')}` : '';

  const externalDups = findExternalIDDupes(db, externalWhere, resultLimit);
  results.external = externalDups;
  totalDuplicates += externalDups.length;

  console.log(`  Found ${externalDups.length} external ID duplicate groups\n`);
}

// 4. Coordinate proximity duplicates
if (!typeFilter || typeFilter === 'coords') {
  console.log('📍 Checking coordinate proximity duplicates...');

  // Get all places with coordinates
  const placesWithCoords = findPlacesWithCoords(db, baseWhere);

  // Group by proximity (simple grid-based approach)
  const proximityGroups = {};
  const gridSize = proximityThreshold;

  for (const place of placesWithCoords) {
    const gridLat = Math.floor(place.lat / gridSize) * gridSize;
    const gridLng = Math.floor(place.lng / gridSize) * gridSize;
    const key = `${gridLat.toFixed(2)}:${gridLng.toFixed(2)}`;

    if (!proximityGroups[key]) proximityGroups[key] = [];
    proximityGroups[key].push(place);
  }

  // Find groups with multiple places
  const coordDups = [];
  for (const [gridKey, places] of Object.entries(proximityGroups)) {
    if (places.length > 1) {
      // Verify they're actually within threshold
      let maxDistance = 0;
      for (let i = 0; i < places.length; i++) {
        for (let j = i + 1; j < places.length; j++) {
          const latDiff = Math.abs(places[i].lat - places[j].lat);
          const lngDiff = Math.abs(places[i].lng - places[j].lng);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
          maxDistance = Math.max(maxDistance, distance);
        }
      }

      if (maxDistance <= proximityThreshold) {
        coordDups.push({
          grid_key: gridKey,
          ids: places.map(p => p.id).join(','),
          count: places.length,
          kinds: [...new Set(places.map(p => p.kind))].join(','),
          countries: [...new Set(places.map(p => p.country_code))].join(','),
          example_name: places[0].name || 'unnamed',
          max_distance: maxDistance.toFixed(4)
        });
      }
    }
  }

  coordDups.sort((a, b) => b.count - a.count);
  results.coords = coordDups.slice(0, resultLimit);
  totalDuplicates += coordDups.length;

  console.log(`  Found ${coordDups.length} coordinate proximity duplicate groups\n`);
}

// 5. Name-based duplicates (same normalized name in same country/kind)
if (!typeFilter || typeFilter === 'names') {
  console.log('🏷️  Checking name-based duplicates...');

  const nameDups = findNameDuplicates(db, baseWhere, resultLimit);
  results.names = nameDups;
  totalDuplicates += nameDups.length;

  console.log(`  Found ${nameDups.length} name-based duplicate groups\n`);
}

// Report results
console.log('=' .repeat(80));
console.log('📋 DUPLICATE DETECTION RESULTS');
console.log('=' .repeat(80));

if (totalDuplicates === 0) {
  console.log('\n✅ No duplicates found!');
} else {
  console.log(`\nFound ${totalDuplicates} total duplicate groups across all checked types.\n`);

  // Wikidata duplicates
  if (results.wikidata.length > 0) {
    console.log('🔍 Wikidata QID Duplicates:');
    console.log('  These are the most reliable duplicate indicators.');
    results.wikidata.forEach((dup, i) => {
      console.log(`  ${i + 1}. QID ${dup.wikidata_qid}: ${dup.count} places - "${dup.example_name}" (${dup.countries})`);
      console.log(`     IDs: ${dup.ids}`);
    });
    console.log();
  }

  // OSM duplicates
  if (results.osm.length > 0) {
    console.log('🗺️  OSM ID Duplicates:');
    console.log('  Places with identical OpenStreetMap identifiers.');
    results.osm.forEach((dup, i) => {
      console.log(`  ${i + 1}. ${dup.osm_key}: ${dup.count} places - "${dup.example_name}" (${dup.countries})`);
      console.log(`     IDs: ${dup.ids}`);
    });
    console.log();
  }

  // External ID duplicates
  if (results.external.length > 0) {
    console.log('🔗 External ID Duplicates:');
    console.log('  Places with identical external identifiers (geonames, etc.).');
    results.external.forEach((dup, i) => {
      console.log(`  ${i + 1}. ${dup.ext_key}: ${dup.count} places - "${dup.example_name}" (${dup.countries})`);
      console.log(`     IDs: ${dup.ids}`);
    });
    console.log();
  }

  // Coordinate duplicates
  if (results.coords.length > 0) {
    console.log('📍 Coordinate Proximity Duplicates:');
    console.log(`  Places within ${proximityThreshold}° (~${(proximityThreshold * 111).toFixed(1)}km) of each other.`);
    results.coords.forEach((dup, i) => {
      console.log(`  ${i + 1}. Grid ${dup.grid_key}: ${dup.count} places - "${dup.example_name}" (max dist: ${dup.max_distance}°)`);
      console.log(`     IDs: ${dup.ids}`);
    });
    console.log();
  }

  // Name duplicates
  if (results.names.length > 0) {
    console.log('🏷️  Name-Based Duplicates:');
    console.log('  Places with identical normalized names in same country/kind.');
    results.names.forEach((dup, i) => {
      console.log(`  ${i + 1}. "${dup.example_name}": ${dup.count} places (${dup.countries})`);
      console.log(`     IDs: ${dup.ids}`);
    });
    console.log();
  }
}

// Summary stats
const summaryWhere = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ').replace(/p\./g, '')}` : '';
const totalPlaces = getTotalPlacesCount(db, summaryWhere);
console.log('=' .repeat(80));
console.log('📊 SUMMARY');
console.log('=' .repeat(80));
console.log(`Total places checked: ${totalPlaces}`);
console.log(`Duplicate groups found: ${totalDuplicates}`);
console.log(`Duplicate types checked: ${Object.keys(results).filter(k => results[k].length > 0).length}/5`);

if (totalDuplicates > 0) {
  console.log('\n💡 Recommendations:');
  console.log('  • Wikidata QID duplicates are most reliable - fix these first');
  console.log('  • Use fix-duplicate-places.js to merge detected duplicates');
  console.log('  • Consider adjusting proximity threshold for coordinate duplicates');
}

db.close();