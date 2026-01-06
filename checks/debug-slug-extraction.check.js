#!/usr/bin/env node
/**
 * Debug slug extraction for Guardian /world/ URLs
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.resolve(__dirname, '../data/news.db'), { readonly: true });

// Get all /world/{slug} URLs with the slug extracted
const query = `
  SELECT DISTINCT 
    url,
    CASE 
      WHEN url LIKE 'https://www.theguardian.com/world/%' 
      THEN substr(url, 37, 
           CASE 
             WHEN instr(substr(url, 37), '/') > 0 
             THEN instr(substr(url, 37), '/') - 1
             ELSE length(substr(url, 37))
           END)
      ELSE NULL
    END as slug
  FROM urls 
  WHERE host = 'www.theguardian.com'
    AND url LIKE 'https://www.theguardian.com/world/%'
  ORDER BY slug
  LIMIT 100
`;

const rows = db.prepare(query).all();

console.log('=== Slug Extraction Debug ===\n');

// Check for major countries
const majorCountries = ['ukraine', 'russia', 'china', 'india', 'israel', 'iran', 'japan', 'mexico', 'turkey'];
const slugs = rows.map(r => r.slug);

console.log('Extracted slugs (first 50):');
console.log(slugs.slice(0, 50).join(', '));

console.log('\n\nMajor country check:');
for (const country of majorCountries) {
  const found = slugs.includes(country);
  console.log(`  ${country}: ${found ? '✓ Found' : '✗ NOT FOUND'}`);
}

// Sample URLs that should have these slugs
console.log('\n\nSample URLs containing major countries:');
const sampleQuery = `
  SELECT url FROM urls 
  WHERE host = 'www.theguardian.com' 
    AND (url LIKE '%/world/ukraine%' 
      OR url LIKE '%/world/russia%'
      OR url LIKE '%/world/china%')
  LIMIT 10
`;
for (const row of db.prepare(sampleQuery).all()) {
  console.log('  ' + row.url);
}

db.close();
