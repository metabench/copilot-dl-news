#!/usr/bin/env node
/**
 * Check Guardian place hub guessing status
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'news.db'), { readonly: true });

// List hub-related tables
console.log('=== Hub-related Tables ===');
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
    AND (name LIKE '%hub%' OR name LIKE '%place%' OR name LIKE '%mapping%')
  ORDER BY name
`).all();
for (const t of tables) {
  console.log(`  ${t.name}`);
}

// Check place_page_mappings in detail
console.log('\n=== Place Page Mappings Summary ===');
const summary = db.prepare(`
  SELECT 
    host,
    COUNT(*) as count,
    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
  FROM place_page_mappings
  GROUP BY host
`).all();
for (const s of summary) {
  console.log(`  ${s.host}: ${s.count} total (${s.verified} verified, ${s.pending} pending)`);
}

// Check place_hub_determinations
console.log('\n=== Recent Place Hub Determinations ===');
const dets = db.prepare(`
  SELECT * FROM place_hub_determinations
  WHERE domain LIKE '%guardian%'
  ORDER BY created_at DESC
  LIMIT 10
`).all();
if (dets.length === 0) {
  console.log('  No determinations found');
} else {
  for (const d of dets) {
    console.log(`  ${d.domain} - ${d.determination}: ${d.url || 'no url'}`);
    console.log(`    created: ${d.created_at}`);
  }
}

// Check place_hub_guess_runs
console.log('\n=== Recent Hub Guess Runs ===');
const runs = db.prepare(`
  SELECT * FROM place_hub_guess_runs
  WHERE domain LIKE '%guardian%'
  ORDER BY started_at DESC
  LIMIT 5
`).all();
if (runs.length === 0) {
  console.log('  No runs found');
} else {
  for (const r of runs) {
    console.log(`  ${r.run_id}: ${r.domain} (${r.status})`);
    console.log(`    started: ${r.started_at}`);
  }
}

db.close();
