#!/usr/bin/env node
/**
 * Debug the place-hub-discover query
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.resolve(__dirname, '../data/news.db'), { readonly: true });

const host = 'theguardian.com';
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
const countQuery = `SELECT COUNT(*) as c FROM urls WHERE host = ? AND url LIKE ? AND url NOT GLOB ?`;
const count = db.prepare(countQuery).get(`www.${host}`, likePattern, notGlob);
console.log('Total matching URLs:', count.c);

// Get sample with slugs
const query = `
  SELECT DISTINCT 
    url,
    substr(url, ?, 
         CASE 
           WHEN instr(substr(url, ?), '/') > 0 
           THEN instr(substr(url, ?), '/') - 1
           ELSE length(substr(url, ?))
         END) as slug
  FROM urls 
  WHERE host = ?
    AND url LIKE ?
    AND url NOT GLOB ?
  ORDER BY slug
  LIMIT 100
`;

const rows = db.prepare(query).all(prefixLen, prefixLen, prefixLen, prefixLen, `www.${host}`, likePattern, notGlob);

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
const countDistinct = db.prepare(`
  SELECT COUNT(DISTINCT 
    substr(url, ${prefixLen}, 
         CASE 
           WHEN instr(substr(url, ${prefixLen}), '/') > 0 
           THEN instr(substr(url, ${prefixLen}), '/') - 1
           ELSE length(substr(url, ${prefixLen}))
         END)) as c 
  FROM urls 
  WHERE host = ?
    AND url LIKE ?
    AND url NOT GLOB ?
`).get(`www.${host}`, likePattern, notGlob);
console.log('Total distinct slugs:', countDistinct.c);

// Check for major countries
console.log('\n=== Major Country Check ===');
const majorCountries = ['ukraine', 'russia', 'china', 'india', 'israel', 'iran', 'france', 'germany', 'japan', 'mexico'];
for (const country of majorCountries) {
  const found = validSlugs.includes(country);
  if (!found) {
    // Check if URL exists at all
    const check = db.prepare(`SELECT url FROM urls WHERE host = ? AND url = ?`).get(`www.${host}`, `https://www.${host}/world/${country}`);
    console.log(`  ${country}: ${found ? '✓' : '✗'} ${check ? '(URL exists: ' + check.url + ')' : '(URL not found)'}`);
  } else {
    console.log(`  ${country}: ✓`);
  }
}

db.close();
