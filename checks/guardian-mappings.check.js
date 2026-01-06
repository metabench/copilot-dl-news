#!/usr/bin/env node
/**
 * Quick DB query check - Guardian place mappings and gaps
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'news.db'), { readonly: true });

// Check Guardian mappings (distinct places)
console.log('=== Guardian Place Mappings (distinct places) ===');
const mappings = db.prepare(`
  SELECT DISTINCT ppm.place_id, ppm.url, ppm.status, ppm.page_kind
  FROM place_page_mappings ppm
  WHERE ppm.host = 'theguardian.com'
  ORDER BY ppm.url
`).all();
console.log(`Found ${mappings.length} distinct place mappings:`);

// Get English names for each
for (const m of mappings) {
  const name = db.prepare(`
    SELECT name FROM place_names WHERE place_id = ? AND lang = 'en' LIMIT 1
  `).get(m.place_id);
  console.log(`  [${m.status}] ${name?.name || 'Unknown'}: ${m.url}`);
}

// Now find potential GAPS - places we discovered in URLs but don't have mappings for
console.log('\n=== Potential Gaps: URL patterns found but not mapped ===');

// Get the slugs from mapped URLs
const mappedSlugs = new Set();
for (const m of mappings) {
  // Extract slug from URL like /world/bangladesh -> bangladesh
  const match = m.url.match(/\/world\/([^\/]+)$/) || m.url.match(/theguardian\.com\/([^\/]+)$/);
  if (match) {
    mappedSlugs.add(match[1].toLowerCase());
  }
}
console.log(`Mapped slugs: ${[...mappedSlugs].slice(0, 20).join(', ')}...`);

// High-priority places that Guardian likely covers but might not be mapped
const potentialPlaces = ['ukraine', 'africa', 'russia', 'france', 'china', 'canada', 'israel', 
  'brazil', 'poland', 'gaza', 'middleeast', 'americas', 'asia-pacific', 'europe',
  'india', 'germany', 'japan', 'mexico', 'spain', 'italy', 'turkey', 'syria',
  'iran', 'iraq', 'yemen', 'lebanon', 'pakistan', 'afghanistan', 'south-africa',
  'kenya', 'nigeria', 'egypt', 'morocco', 'vietnam', 'philippines',
  'indonesia', 'south-korea', 'north-korea', 'taiwan', 'hong-kong', 'singapore',
  'new-zealand', 'uk', 'us', 'united-states', 'united-kingdom'];

console.log('\nHigh-priority places NOT in mappings:');
for (const p of potentialPlaces) {
  if (!mappedSlugs.has(p) && !mappedSlugs.has(p.replace(/-/g, ''))) {
    console.log(`  /world/${p}`);
  }
}

// Check what countries exist in places table but don't have Guardian mappings
console.log('\n=== Countries in DB without Guardian mapping ===');
const unmapped = db.prepare(`
  SELECT DISTINCT p.id, pn.name
  FROM places p
  JOIN place_names pn ON pn.place_id = p.id AND pn.lang = 'en' AND pn.is_preferred = 1
  WHERE p.place_type = 'country'
    AND p.id NOT IN (
      SELECT place_id FROM place_page_mappings WHERE host = 'theguardian.com'
    )
  ORDER BY pn.name
  LIMIT 30
`).all();
console.log(`Found ${unmapped.length} unmapped countries:`);
for (const u of unmapped) {
  console.log(`  ${u.name} (place_id=${u.id})`);
}

db.close();
