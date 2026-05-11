#!/usr/bin/env node
'use strict';

/**
 * Check: Place Hub Guessing — The Guardian Row
 * 
 * Verifies that The Guardian's place hub mappings display correctly
 * in the matrix with proper cell states and links.
 */

const path = require('path');

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { renderPlaceHubGuessingMatrixHtml } = require('../server');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}`);
    failed++;
  }
}

function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Check: Place Hub Guessing — The Guardian Row');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const resolved = resolveBetterSqliteHandle({ dbPath: DB_PATH, readonly: true });
  const { dbHandle } = resolved;
  const diagnostics = dbHandle?.placeHubDiagnostics;

  try {
    check(!!dbHandle, 'Database handle resolved');
    check(!!diagnostics, 'Place-hub diagnostics access resolved');
    if (!diagnostics) {
      throw new Error('news-crawler-db placeHubDiagnostics access is required');
    }

    const mappingCount = diagnostics.countPlacePageMappingsForHostAndKind('theguardian.com', 'country-hub');
    
    console.log(`\n📊 The Guardian has ${mappingCount} country-hub mappings\n`);
    check(mappingCount > 0, 'The Guardian has place mappings in database');

    // Test 1: Render matrix filtered to just The Guardian
    const html = renderPlaceHubGuessingMatrixHtml({
      dbHandle,
      placeKind: 'country',
      pageKind: 'country-hub',
      placeLimit: 300,    // Show all countries (249 in db)
      hostLimit: 1,      // Just one host
      hostQ: 'guardian', // Filter to Guardian
      matrixMode: 'table'
    });

    check(typeof html === 'string' && html.length > 500, 'HTML rendered');
    check(html.includes('data-testid="place-hub-guessing"'), 'Has root test id');
    check(html.includes('theguardian.com'), 'Contains theguardian.com host');
    
    // Check for verified cells (The Guardian has verified mappings)
    check(html.includes('cell--verified-present'), 'Has verified-present cells');
    
    // Count verified cells in HTML
    const verifiedMatches = html.match(/cell--verified-present/g);
    const verifiedCount = verifiedMatches ? verifiedMatches.length : 0;
    console.log(`\n📊 Found ${verifiedCount} verified-present cell references in HTML\n`);
    
    // Check that stats show correct numbers
    check(html.includes('Hosts'), 'Stats show Hosts label');
    check(html.includes('Verified'), 'Stats show Verified label');

    // Test 2: Check that cell links are correct
    check(html.includes('/cell?placeId='), 'Has cell drilldown links');
    check(html.includes('host=theguardian.com'), 'Cell links include guardian host');

    // Test 3: Verify the flipped view (Host rows, Place columns)
    check(html.includes('data-testid="matrix-view-b"'), 'Has flipped view B');
    check(html.includes('Host \\ Place'), 'Has flipped corner label');

    const guardianPlaces = diagnostics.listMappedCountryPlaceNamesForHostAndKind(
      'theguardian.com',
      'country-hub',
      { limit: 10 }
    );

    console.log('\n📍 Sample Guardian places:');
    for (const p of guardianPlaces.slice(0, 5)) {
      console.log(`   - ${p.place_name}`);
      check(html.includes(p.place_name), `Matrix includes place: ${p.place_name}`);
    }

    console.log('');
    console.log('--- HTML Stats Extract ---');
    
    // Extract stats section
    // Updated: Look for the matrix-stats class which contains the stats
    if (html.includes('class="matrix-stats"') || html.includes('class="matrix-legend"')) {
      check(true, 'Stats/Legend section found in HTML');
    } else {
      check(false, 'Stats/Legend section found in HTML');
    }

    console.log('');
    console.log(`${passed}/${passed + failed} checks passed`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Error:', err.stack || err.message);
    process.exit(2);
  } finally {
    try {
      resolved.close();
    } catch {
      // ignore
    }
  }

  process.exit(0);
}

main();
