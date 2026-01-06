#!/usr/bin/env node
/**
 * Guardian URL patterns exploration check
 * Analyzes URL patterns in the database to find potential place hub pages
 * 
 * @module checks/guardian-urls.check
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'news.db'), { readonly: true });

console.log('=== Guardian URL Pattern Analysis ===\n');

// 1. Count total Guardian URLs
const totalCount = db.prepare(`
  SELECT COUNT(*) as count FROM urls WHERE host = 'www.theguardian.com'
`).get();
console.log(`Total Guardian URLs: ${totalCount.count}`);

// 2. Find distinct URL path patterns (first 2 segments)
console.log('\n--- Top URL Path Patterns (first segment) ---');
const pathPatterns = db.prepare(`
  SELECT 
    CASE 
      WHEN instr(substr(url, 28), '/') > 0 
      THEN substr(url, 28, instr(substr(url, 28), '/') - 1)
      ELSE substr(url, 28)
    END as first_segment,
    COUNT(*) as count
  FROM urls 
  WHERE host = 'www.theguardian.com'
  GROUP BY first_segment
  ORDER BY count DESC
  LIMIT 20
`).all();

for (const row of pathPatterns) {
  console.log(`  ${row.first_segment}: ${row.count}`);
}

// 3. Find /world/xxx patterns (known place hub pattern)
console.log('\n--- /world/{country} patterns ---');
const worldPatterns = db.prepare(`
  SELECT 
    CASE 
      WHEN url LIKE 'https://www.theguardian.com/world/%'
      THEN substr(url, 35, 
           CASE 
             WHEN instr(substr(url, 35), '/') > 0 
             THEN instr(substr(url, 35), '/') - 1
             ELSE length(substr(url, 35))
           END)
      ELSE NULL
    END as country,
    COUNT(*) as count
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND url LIKE 'https://www.theguardian.com/world/%'
  GROUP BY country
  HAVING country IS NOT NULL AND length(country) > 0
  ORDER BY count DESC
  LIMIT 30
`).all();

for (const row of worldPatterns) {
  console.log(`  /world/${row.country}: ${row.count} pages`);
}

// 4. Find potential index/hub pages (short URLs, many links to them)
console.log('\n--- Potential Index/Hub Pages (short URLs) ---');
const shortUrls = db.prepare(`
  SELECT url, 
         length(url) as url_len
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND length(url) < 50
  ORDER BY url_len ASC
  LIMIT 20
`).all();

for (const row of shortUrls) {
  console.log(`  ${row.url}`);
}

// 5. Check for /au, /us, /uk patterns (regional hubs)
console.log('\n--- Regional Hub Patterns ---');
const regionalPatterns = db.prepare(`
  SELECT url
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND (
      url LIKE 'https://www.theguardian.com/au%'
      OR url LIKE 'https://www.theguardian.com/us%'
      OR url LIKE 'https://www.theguardian.com/uk%'
      OR url LIKE 'https://www.theguardian.com/australia%'
      OR url LIKE 'https://www.theguardian.com/us-news%'
      OR url LIKE 'https://www.theguardian.com/uk-news%'
    )
  LIMIT 20
`).all();

for (const row of regionalPatterns) {
  console.log(`  ${row.url}`);
}

// 6. Check existing place_page_mappings
console.log('\n--- Existing Place Mappings for Guardian ---');
const mappings = db.prepare(`
  SELECT 
    ppm.url,
    pn.name as place_name,
    ppm.status,
    ppm.page_kind
  FROM place_page_mappings ppm
  JOIN place_names pn ON pn.place_id = ppm.place_id AND pn.is_preferred = 1
  WHERE ppm.host = 'www.theguardian.com'
  ORDER BY pn.name
  LIMIT 30
`).all();

console.log(`Found ${mappings.length} mappings (showing first 30):`);
for (const row of mappings) {
  console.log(`  [${row.status}] ${row.place_name}: ${row.url}`);
}

// 7. Find potential place-like URL slugs at root level
console.log('\n--- Root-level Country/Place Slugs ---');
const rootPlaces = db.prepare(`
  SELECT url
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND url GLOB 'https://www.theguardian.com/[a-z]*'
    AND length(url) - length(replace(url, '/', '')) <= 4
    AND url NOT LIKE '%/20%'
    AND url NOT LIKE '%article%'
    AND url NOT LIKE '%live%'
  ORDER BY url
  LIMIT 40
`).all();

for (const row of rootPlaces) {
  console.log(`  ${row.url}`);
}

// 8. Find /world/ sub-sections that look like places
console.log('\n--- /world/ Place-like Subsections ---');
const worldPlaces = db.prepare(`
  SELECT DISTINCT
    CASE 
      WHEN url LIKE 'https://www.theguardian.com/world/%'
      THEN substr(url, 35, 
           CASE 
             WHEN instr(substr(url, 35), '/') > 0 
             THEN instr(substr(url, 35), '/') - 1
             ELSE length(substr(url, 35))
           END)
      ELSE NULL
    END as section,
    COUNT(*) as count
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND url LIKE 'https://www.theguardian.com/world/%'
    AND url NOT GLOB 'https://www.theguardian.com/world/[0-9]*'
    AND url NOT LIKE '%/article/%'
    AND url NOT LIKE '%/live/%'
    AND url NOT LIKE '%/video/%'
    AND url NOT LIKE '%/gallery/%'
  GROUP BY section
  HAVING section IS NOT NULL 
    AND length(section) > 2 
    AND section NOT IN ('series', 'ng-interactive', 'commentisfree')
  ORDER BY count DESC
  LIMIT 30
`).all();

for (const row of worldPlaces) {
  console.log(`  /world/${row.section}: ${row.count} pages`);
}

db.close();
console.log('\n=== Check Complete ===');
