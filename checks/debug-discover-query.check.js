#!/usr/bin/env node
/**
 * Debug the place-hub-discover query
 */
'use strict';

const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
const path = require('path');
const db = openNewsCrawlerDb(path.resolve(__dirname, '../data/news.db'), { readonly: true });
const diagnostics = db.placeHubDiagnostics;
if (!diagnostics) {
  throw new Error('news-crawler-db does not expose placeHubDiagnostics');
}

const host = 'theguardian.com';
const dbHost = `www.${host}`;
const prefix = '/world/';
const likePattern = `https://www.${host}${prefix}%`;
const prefixLen = `https://www.${host}${prefix}`.length + 1;
const notGlob = `https://www.${host}${prefix}[0-9]*`;

console.log('=== Debug place-hub-discover ===');
console.log('Host:', host);
console.log('Prefix:', prefix);
console.log('LIKE pattern:', likePattern);
console.log('Prefix length for substr:', prefixLen);
console.log('NOT GLOB:', notGlob);
console.log('');

// First, count how many URLs match the pattern
const count = diagnostics.countUrlsForHostPrefix(dbHost, prefix, { excludeNumeric: true });
console.log('Total matching URLs:', count);

// Get sample with slugs
const rows = diagnostics.listUrlSlugsForHostPrefix(dbHost, prefix, {
  excludeNumeric: true,
  limit: 100
});

console.log('\nSample slugs (first 50):');
let empty = 0, valid = 0;
const validSlugs = [];
for (const row of rows) {
  if (!row.slug || row.slug.length === 0) {
    empty++;
  } else {
    valid++;
    validSlugs.push(row.slug);
    if (validSlugs.length <= 30) {
      console.log(`  ${row.slug} <- ${row.url}`);
    }
  }
}
console.log(`\nEmpty: ${empty}, Valid: ${valid}`);

// Count total distinct slugs (without limit)
console.log('\n=== Total Distinct Slugs ===');
const countDistinct = diagnostics.countDistinctUrlSlugsForHostPrefix(dbHost, prefix, { excludeNumeric: true });
console.log('Total distinct slugs:', countDistinct);

// Check for major countries
console.log('\n=== Major Country Check ===');
const majorCountries = ['ukraine', 'russia', 'china', 'india', 'israel', 'iran', 'france', 'germany', 'japan', 'mexico'];
for (const country of majorCountries) {
  const found = validSlugs.includes(country);
  if (!found) {
    // Check if URL exists at all
    const check = diagnostics.urlExistsForHost(dbHost, `https://www.${host}/world/${country}`);
    console.log(`  ${country}: ${found ? '✓' : '✗'} ${check ? '(URL exists: ' + check.url + ')' : '(URL not found)'}`);
  } else {
    console.log(`  ${country}: ✓`);
  }
}

db.close();
