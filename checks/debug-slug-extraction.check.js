#!/usr/bin/env node
/**
 * Debug slug extraction for Guardian /world/ URLs
 */
'use strict';

const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
const path = require('path');
const db = openNewsCrawlerDb(path.resolve(__dirname, '../data/news.db'), { readonly: true });
const diagnostics = db.placeHubDiagnostics;
if (!diagnostics) {
  throw new Error('news-crawler-db does not expose placeHubDiagnostics');
}

// Get all /world/{slug} URLs with the slug extracted
const rows = diagnostics.listUrlSlugsForHostPrefix('www.theguardian.com', '/world/', { limit: 100 });

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
const sampleRows = diagnostics.listUrlsMatchingPrefixesForHost(
  'www.theguardian.com',
  ['/world/ukraine', '/world/russia', '/world/china'],
  { limit: 10 }
);
for (const row of sampleRows) {
  console.log('  ' + row.url);
}

db.close();
