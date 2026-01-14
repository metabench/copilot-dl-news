#!/usr/bin/env node

const path = require('path');
const { ensureDatabase } = require('../src/data/db/sqlite');

const db = ensureDatabase(path.join('.', 'data', 'news.db'));

// First check table schemas
console.log('=== http_responses columns ===');
const httpCols = db.prepare("PRAGMA table_info(http_responses)").all();
console.log(httpCols.map(c => c.name).join(', '));

console.log('\n=== content_analysis columns ===');
const analysisCols = db.prepare("PRAGMA table_info(content_analysis)").all();
console.log(analysisCols.map(c => c.name).join(', '));

console.log('\n=== fetches table (if exists) ===');
try {
  const fetchCols = db.prepare("PRAGMA table_info(fetches)").all();
  console.log(fetchCols.map(c => c.name).join(', '));
} catch (e) {
  console.log('(fetches table does not exist)');
}

console.log('\n=== Query attempt ===');
const result = db.prepare(`
  SELECT 
    u.url, 
    ca.classification,
    ca.analysis_json
  FROM content_analysis ca
  JOIN content_storage cs ON ca.content_id = cs.id
  JOIN http_responses hr ON cs.http_response_id = hr.id
  JOIN urls u ON hr.url_id = u.id
  WHERE u.url = 'https://www.theguardian.com/world'
  ORDER BY hr.fetched_at DESC
  LIMIT 1
`).get();

console.log('Result:');
console.log(JSON.stringify(result, null, 2));

if (result && result.analysis_json) {
  try {
    const analysis = JSON.parse(result.analysis_json);
    console.log('\nAnalysis JSON:');
    console.log(JSON.stringify(analysis, null, 2));
  } catch (e) {
    console.log('Could not parse analysis_json:', e.message);
  }
}

db.close();
