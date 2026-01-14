#!/usr/bin/env node
/**
 * List capital cities recorded in the system
 * 
 * Usage:
 *   node tools/gazetteer/list-capital-cities.js                    # List all capitals with names
 *   node tools/gazetteer/list-capital-cities.js --with-country     # Include country information
 *   node tools/gazetteer/list-capital-cities.js --json             # Output as JSON
 * 
 * Data Source:
 *   Queries the places table for cities with {"role":"capital"} in the extra JSON field.
 *   Names are retrieved from place_names table using canonical_name_id or preferred name.
 * 
 * Notes:
 *   - Some capitals may appear multiple times (e.g., London, Dublin) if there are 
 *     multiple place records for the same city
 *   - Some capitals may be missing names if place_names entries don't exist
 *   - Population data may be null for many capitals
 */

const { ensureDatabase } = require('../../src/data/db/sqlite');
const path = require('path');

const args = process.argv.slice(2);
const withCountry = args.includes('--with-country');
const jsonOutput = args.includes('--json');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Query for capital cities with their names
// Use subquery to get the best available name for each place
const query = `
  SELECT 
    p.id,
    p.kind,
    p.country_code,
    p.lat,
    p.lng,
    p.population,
    p.timezone,
    p.extra,
    COALESCE(
      (SELECT name FROM place_names WHERE id = p.canonical_name_id),
      (SELECT name FROM place_names WHERE place_id = p.id ORDER BY is_preferred DESC, is_official DESC LIMIT 1),
      '(unnamed)'
    ) as name
  FROM places p
  WHERE p.kind = 'city' 
    AND json_extract(p.extra, '$.role') = 'capital'
    AND p.status = 'current'
  ORDER BY p.country_code, name
`;

const capitals = db.prepare(query).all();

if (jsonOutput) {
  // Output as JSON
  const result = capitals.map(row => ({
    id: row.id,
    name: row.name || '(unnamed)',
    country_code: row.country_code,
    coordinates: row.lat && row.lng ? { lat: row.lat, lng: row.lng } : null,
    population: row.population,
    timezone: row.timezone
  }));
  console.log(JSON.stringify(result, null, 2));
} else {
  // Human-readable output
  console.log(`\n${capitals.length} capital cities found:\n`);
  
  if (capitals.length === 0) {
    console.log('No capital cities recorded in the system.');
  } else {
    // Group by country if requested
    if (withCountry) {
      const byCountry = {};
      capitals.forEach(cap => {
        const cc = cap.country_code || 'Unknown';
        if (!byCountry[cc]) byCountry[cc] = [];
        byCountry[cc].push(cap);
      });
      
      Object.keys(byCountry).sort().forEach(cc => {
        console.log(`\n${cc}:`);
        byCountry[cc].forEach(cap => {
          const coords = cap.lat && cap.lng ? `(${cap.lat.toFixed(2)}, ${cap.lng.toFixed(2)})` : '';
          const pop = cap.population ? `pop: ${cap.population.toLocaleString()}` : '';
          const tz = cap.timezone ? `tz: ${cap.timezone}` : '';
          const details = [coords, pop, tz].filter(x => x).join(', ');
          console.log(`  - ${cap.name || '(unnamed)'} ${details ? '- ' + details : ''}`);
        });
      });
    } else {
      // Simple list
      capitals.forEach(cap => {
        const cc = cap.country_code ? `[${cap.country_code}]` : '';
        const coords = cap.lat && cap.lng ? `(${cap.lat.toFixed(2)}, ${cap.lng.toFixed(2)})` : '';
        const pop = cap.population ? `pop: ${cap.population.toLocaleString()}` : '';
        console.log(`${cap.name || '(unnamed)'} ${cc} ${coords} ${pop}`.trim());
      });
    }
  }
  
  console.log();
}

