#!/usr/bin/env node
/**
 * Generate a deterministic fixture of 2000 URLs with stored HTML content
 * for place detection benchmarking.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

const db = ensureDatabase(path.join(__dirname, '../../data/news.db'), { readonly: true });

console.log('=== Generating URL Fixture ===\n');

// Count URLs with HTML content
const totalCount = db.prepare(`
  SELECT COUNT(DISTINCT u.id) as cnt 
  FROM urls u 
  JOIN http_responses hr ON hr.url_id = u.id 
  JOIN content_storage cs ON cs.http_response_id = hr.id 
`).get();

console.log(`Total URLs with HTML content: ${totalCount.cnt}`);

if (totalCount.cnt < 2000) {
  console.log(`WARNING: Only ${totalCount.cnt} URLs available, need 2000`);
}

// Get 2000 URLs with HTML content, ordered by URL id for determinism
// Include a mix: some with likely place names in URL, some without
// Skip test URLs and very small content
const urls = db.prepare(`
  SELECT 
    u.id as url_id,
    u.url,
    u.host,
    hr.id as response_id,
    cs.id as content_id,
    cs.uncompressed_size as content_size
  FROM urls u 
  JOIN http_responses hr ON hr.url_id = u.id 
  JOIN content_storage cs ON cs.http_response_id = hr.id 
  WHERE cs.uncompressed_size > 1000
    AND u.url NOT LIKE '%example.com%'
  ORDER BY u.id
  LIMIT 2000
`).all();

console.log(`Retrieved ${urls.length} URLs\n`);

// Analyze URL patterns
const patterns = {
  hasPlaceSlug: 0,
  hasNewsKeyword: 0,
  hasWorldSection: 0,
  avgContentSize: 0
};

let totalSize = 0;
for (const u of urls) {
  totalSize += u.content_size || 0;
  
  // Check for place-like patterns in URL
  if (/\/(uk|us|usa|london|paris|berlin|new-york|washington|australia|europe|asia|africa|middle-east|americas|world)/i.test(u.url)) {
    patterns.hasPlaceSlug++;
  }
  if (/\/(news|article|story)/i.test(u.url)) {
    patterns.hasNewsKeyword++;
  }
  if (/\/(world|international|global)/i.test(u.url)) {
    patterns.hasWorldSection++;
  }
}

patterns.avgContentSize = Math.round(totalSize / urls.length);

console.log('URL Pattern Analysis:');
console.log(`  - Has place slug in URL: ${patterns.hasPlaceSlug} (${(patterns.hasPlaceSlug/urls.length*100).toFixed(1)}%)`);
console.log(`  - Has news keyword: ${patterns.hasNewsKeyword} (${(patterns.hasNewsKeyword/urls.length*100).toFixed(1)}%)`);
console.log(`  - Has world section: ${patterns.hasWorldSection} (${(patterns.hasWorldSection/urls.length*100).toFixed(1)}%)`);
console.log(`  - Average content size: ${patterns.avgContentSize.toLocaleString()} bytes`);

// Create fixture
const fixture = {
  generated: new Date().toISOString(),
  count: urls.length,
  patterns,
  urls: urls.map(u => ({
    urlId: u.url_id,
    url: u.url,
    host: u.host,
    responseId: u.response_id,
    contentId: u.content_id,
    contentSize: u.content_size
  }))
};

// Save fixture
const fixtureDir = path.join(__dirname, 'fixtures');
if (!fs.existsSync(fixtureDir)) {
  fs.mkdirSync(fixtureDir, { recursive: true });
}

const fixturePath = path.join(fixtureDir, 'urls-with-content-2000.json');
fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

console.log(`\n✓ Fixture saved to: ${fixturePath}`);

// Also extract just the URL IDs for quick loading
const idsPath = path.join(fixtureDir, 'url-ids-2000.json');
fs.writeFileSync(idsPath, JSON.stringify(urls.map(u => u.url_id)));
console.log(`✓ URL IDs saved to: ${idsPath}`);

db.close();
