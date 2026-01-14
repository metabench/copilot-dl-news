#!/usr/bin/env node

/**
 * list-place-hubs - List all discovered place hubs from the database
 * 
 * Usage:
 *   node tools/gazetteer/list-place-hubs.js                  List all place hubs
 *   node tools/gazetteer/list-place-hubs.js --non-country    List only non-country place hubs (cities, regions, etc.)
 *   node tools/gazetteer/list-place-hubs.js --with-counts    Include IDs and article counts
 */

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const { getAllCountries } = require('../../src/data/db/sqlite/queries/gazetteer.places');

// Parse command line arguments
const args = process.argv.slice(2);
const nonCountryOnly = args.includes('--non-country');
const withCounts = args.includes('--with-counts');

// Load configuration
const configPath = path.join(__dirname, '..', '..', 'config.json');
let config = { url: 'https://www.theguardian.com' };

try {
  const configData = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configData);
} catch (error) {
  console.warn(`Warning: Could not load config.json, using default URL`);
}

// Extract domain from URL
const domain = new URL(config.url).hostname;

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Load all countries from gazetteer for filtering
const allCountries = getAllCountries(db);
const countryNames = new Set(allCountries.map(c => c.name.toLowerCase()));

// Query the place_hubs table directly
let query;
let placeHubs;

if (withCounts) {
  query = `
    SELECT ph.id, ph.place_slug, ph.title, ph.url, COUNT(hr.id) as download_count
    FROM place_hubs ph
    LEFT JOIN urls u ON ph.url = u.url
    LEFT JOIN http_responses hr ON u.id = hr.url_id
    WHERE ph.host LIKE ?
    AND ph.place_slug IS NOT NULL
    AND ph.place_slug != ''
    AND ph.url NOT LIKE '%?page=%'
    AND ph.url NOT LIKE '%&page=%'
    GROUP BY ph.id, ph.place_slug, ph.title, ph.url
    ORDER BY ph.url
  `;
  placeHubs = db.prepare(query).all(`%${domain}%`);
} else {
  query = `
    SELECT place_slug, title, url
    FROM place_hubs
    WHERE host LIKE ?
    AND place_slug IS NOT NULL
    AND place_slug != ''
    AND url NOT LIKE '%?page=%'
    AND url NOT LIKE '%&page=%'
    ORDER BY place_slug
  `;
  placeHubs = db.prepare(query).all(`%${domain}%`);
}

// Format the hubs
let hubs;
if (withCounts) {
  hubs = placeHubs.map(hub => {
    // Use place_slug as the name, but capitalize it nicely
    const name = hub.place_slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return { 
      id: hub.id, 
      name, 
      title: hub.title, 
      url: hub.url, 
      download_count: hub.download_count 
    };
  });
} else {
  hubs = placeHubs.map(hub => {
    // Use place_slug as the name, but capitalize it nicely
    const name = hub.place_slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return { name, title: hub.title, url: hub.url };
  });
}

// Remove duplicates by name (keep first occurrence)
const uniqueHubs = [];
const seenNames = new Set();

hubs.forEach(hub => {
  if (!seenNames.has(hub.name.toLowerCase())) {
    seenNames.add(hub.name.toLowerCase());
    uniqueHubs.push(hub);
  }
});

// Filter by country/non-country if requested
let filteredHubs = uniqueHubs;
if (nonCountryOnly) {
  filteredHubs = uniqueHubs.filter(hub => {
    // Check if this place name matches a country in gazetteer
    return !countryNames.has(hub.name.toLowerCase());
  });
}

// Display results
const hubType = nonCountryOnly ? '🗺️  Non-Country Place Hubs' : '🌐 Place Hubs';
const countType = withCounts ? ' (with IDs and download counts)' : '';
console.log(`\n${hubType}${countType} (${config.url})\n`);

if (withCounts) {
  // Table format with IDs and counts
  console.log('─'.repeat(80));
  console.log('ID'.padEnd(8) + 'URL'.padEnd(50) + 'Downloads');
  console.log('─'.repeat(80));
  
  if (filteredHubs.length === 0) {
    console.log('\nNo place hubs found in database.\n');
  } else {
    filteredHubs.forEach(hub => {
      const id = String(hub.id).padEnd(8);
      const url = hub.url.length > 45 ? hub.url.substring(0, 42) + '...' : hub.url.padEnd(50);
      const count = String(hub.download_count);
      console.log(`${id}${url}${count}`);
    });
    
    console.log('─'.repeat(80));
    console.log(`Total: ${filteredHubs.length} place hub${filteredHubs.length === 1 ? '' : 's'}\n`);
  }
} else {
  // Original format
  console.log('─'.repeat(120));

  if (filteredHubs.length === 0) {
    if (nonCountryOnly) {
      console.log('\nNo non-country place hubs found in database.\n');
    } else {
      console.log('\nNo place hubs found in database.\n');
    }
  } else {
    filteredHubs.forEach((hub, index) => {
      const num = `${index + 1}.`.padEnd(6);
      const name = hub.name.padEnd(35);
      console.log(`${num}${name}${hub.url}`);
    });
    
    console.log('\n' + '─'.repeat(120));
    console.log(`Total: ${filteredHubs.length} place hub${filteredHubs.length === 1 ? '' : 's'}\n`);
  }
}

// Close database
db.close();

