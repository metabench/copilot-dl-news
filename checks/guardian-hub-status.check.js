#!/usr/bin/env node
/**
 * Check Guardian place hub guessing status
 */
'use strict';
const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
const path = require('path');

const db = openNewsCrawlerDb(path.join(__dirname, '..', 'data', 'news.db'), { readonly: true });
const diagnostics = db.placeHubDiagnostics;
if (!diagnostics) {
  throw new Error('news-crawler-db does not expose placeHubDiagnostics');
}

// List hub-related tables
console.log('=== Hub-related Tables ===');
const tables = diagnostics.listPlaceHubRelatedTableNames();
for (const t of tables) {
  console.log(`  ${t}`);
}

// Check place_page_mappings in detail
console.log('\n=== Place Page Mappings Summary ===');
const summary = diagnostics.summarizePlacePageMappingsByHost();
for (const s of summary) {
  console.log(`  ${s.host}: ${s.count} total (${s.verified} verified, ${s.pending} pending)`);
}

// Check place_hub_determinations
console.log('\n=== Recent Place Hub Determinations ===');
const dets = diagnostics.listRecentPlaceHubDeterminations('%guardian%', { limit: 10 });
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
const runs = diagnostics.listRecentPlaceHubGuessRuns('%guardian%', { limit: 5 });
if (runs.length === 0) {
  console.log('  No runs found');
} else {
  for (const r of runs) {
    console.log(`  ${r.run_id}: ${r.domain} (${r.status})`);
    console.log(`    started: ${r.started_at}`);
  }
}

db.close();
