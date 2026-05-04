#!/usr/bin/env node
/**
 * Debug content join path
 */
'use strict';

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

const db = ensureDatabase(path.join(__dirname, '../../data/news.db'), { readonly: true });

// Check content_analysis data directly
console.log('=== content_analysis table ===');
const sample = db.prepare(`
  SELECT id, content_id, title, word_count, LENGTH(body_text) as body_len 
  FROM content_analysis 
  LIMIT 5
`).all();
console.log('Sample:', sample);

const noBody = db.prepare(`SELECT COUNT(*) as cnt FROM content_analysis WHERE body_text IS NULL`).get();
console.log('Null body_text:', noBody.cnt);

const emptyBody = db.prepare(`SELECT COUNT(*) as cnt FROM content_analysis WHERE body_text = ''`).get();
console.log('Empty body_text:', emptyBody.cnt);

const hasBody = db.prepare(`SELECT COUNT(*) as cnt FROM content_analysis WHERE body_text IS NOT NULL AND LENGTH(body_text) > 0`).get();
console.log('Has body_text:', hasBody.cnt);

// Check full join path
const cnt = db.prepare(`
  SELECT COUNT(*) as cnt 
  FROM urls u 
  JOIN http_responses hr ON hr.url_id = u.id 
  JOIN content_storage cs ON cs.http_response_id = hr.id 
  JOIN content_analysis ca ON ca.content_id = cs.id 
  WHERE ca.body_text IS NOT NULL
`).get();

console.log('URLs with full content path:', cnt.cnt);

// Get sample IDs with content
const sample2 = db.prepare(`
  SELECT u.id, u.url, ca.title, LENGTH(ca.body_text) as text_len
  FROM urls u 
  JOIN http_responses hr ON hr.url_id = u.id 
  JOIN content_storage cs ON cs.http_response_id = hr.id 
  JOIN content_analysis ca ON ca.content_id = cs.id 
  WHERE ca.body_text IS NOT NULL
  ORDER BY u.id
  LIMIT 5
`).all();

console.log('\nSample URLs with content:');
for (const row of sample2) {
  console.log(`  ID ${row.id}: ${row.url.slice(0, 60)}... (${row.text_len} chars)`);
}

// Check what IDs are in our fixture
const fs = require('fs');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/urls-with-content-2000.json'), 'utf8'));
console.log('\nFixture URL ID range:', fixture.urls[0]?.urlId, '-', fixture.urls[fixture.urls.length - 1]?.urlId);

// Check overlap
const fixtureIds = new Set(fixture.urls.map(u => u.urlId));
const contentIds = sample2.map(s => s.id);
const overlap = contentIds.filter(id => fixtureIds.has(id));
console.log('Overlap with fixture:', overlap.length);

// Get the actual URL ID range that has content
const idRange = db.prepare(`
  SELECT MIN(u.id) as min_id, MAX(u.id) as max_id
  FROM urls u 
  JOIN http_responses hr ON hr.url_id = u.id 
  JOIN content_storage cs ON cs.http_response_id = hr.id 
  JOIN content_analysis ca ON ca.content_id = cs.id 
  WHERE ca.body_text IS NOT NULL
`).get();

console.log('Content URL ID range in DB:', idRange.min_id, '-', idRange.max_id);

db.close();
