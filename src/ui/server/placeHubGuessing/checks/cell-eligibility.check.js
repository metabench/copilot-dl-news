#!/usr/bin/env node
/**
 * Check script for PlaceHubGuessingCellControl with host eligibility
 * Verifies the crawl button appears for hosts needing more pages
 * 
 * Run: node src/ui/server/placeHubGuessing/checks/cell-eligibility.check.js
 */
'use strict';

const jsgui = require('jsgui3-html');
const { PlaceHubGuessingCellControl } = require('../controls/PlaceHubGuessingCellControl');

// Test case 1: Host needs crawling (< 500 pages)
function testNeedsCrawling() {
  console.log('Test 1: Host needs crawling');
  console.log('─────────────────────────────────────────────────────────────');
  
  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath: '/place-hubs',
    model: {
      backHref: '/place-hubs',
      placeLabel: 'France',
      host: 'www.example.com',
      pageKind: 'country-hub',
      cellState: 'Unchecked',
      currentUrl: '(none)',
      verifiedLabel: '',
      mappingJson: '',
      modelContext: {
        placeKind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      },
      hostEligibility: {
        host: 'www.example.com',
        pageCount: 250,
        isEligible: false,
        threshold: 500,
        target: 600,
        pagesNeeded: 250
      },
      place: { place_id: 1, place_name: 'France' },
      mapping: null,
      hidden: {
        placeId: 1,
        host: 'www.example.com',
        kind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      }
    }
  });

  const html = control.render();
  
  // Check for expected elements
  const checks = [
    { name: 'Has eligibility card', test: () => html.includes('data-testid="host-eligibility"') },
    { name: 'Shows not eligible', test: () => html.includes('data-eligible="false"') },
    { name: 'Has crawl button', test: () => html.includes('id="startCrawlBtn"') },
    { name: 'Shows page count (250)', test: () => html.includes('>250<') },
    { name: 'Shows pages needed (250 more)', test: () => html.includes('250 more pages') },
    { name: 'Has crawl status element', test: () => html.includes('id="crawlStatus"') },
    { name: 'Has crawl script', test: () => html.includes('startCrawlBtn') && html.includes('addEventListener') }
  ];

  let passed = 0;
  for (const check of checks) {
    const result = check.test();
    console.log(`   ${result ? '✓' : '✗'} ${check.name}`);
    if (result) passed++;
  }
  
  console.log(`\n   ${passed}/${checks.length} checks passed\n`);
  return passed === checks.length;
}

// Test case 2: Host is eligible (500+ pages)
function testEligible() {
  console.log('Test 2: Host is eligible');
  console.log('─────────────────────────────────────────────────────────────');
  
  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath: '/place-hubs',
    model: {
      backHref: '/place-hubs',
      placeLabel: 'France',
      host: 'www.theguardian.com',
      pageKind: 'country-hub',
      cellState: 'Unchecked',
      currentUrl: '(none)',
      verifiedLabel: '',
      mappingJson: '',
      modelContext: {
        placeKind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      },
      hostEligibility: {
        host: 'www.theguardian.com',
        pageCount: 65000,
        isEligible: true,
        threshold: 500,
        target: 600,
        pagesNeeded: 0
      },
      place: { place_id: 1, place_name: 'France' },
      mapping: null,
      hidden: {
        placeId: 1,
        host: 'www.theguardian.com',
        kind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      }
    }
  });

  const html = control.render();
  
  // Check for expected elements
  const checks = [
    { name: 'Has eligibility card', test: () => html.includes('data-testid="host-eligibility"') },
    { name: 'Shows eligible', test: () => html.includes('data-eligible="true"') },
    { name: 'No crawl button', test: () => !html.includes('id="startCrawlBtn"') },
    { name: 'Shows eligible status class', test: () => html.includes('eligibility-ok') },
    { name: 'Shows page count (65,000)', test: () => html.includes('65,000') }
  ];

  let passed = 0;
  for (const check of checks) {
    const result = check.test();
    console.log(`   ${result ? '✓' : '✗'} ${check.name}`);
    if (result) passed++;
  }
  
  console.log(`\n   ${passed}/${checks.length} checks passed\n`);
  return passed === checks.length;
}

// Test case 3: No host eligibility data
function testNoEligibilityData() {
  console.log('Test 3: No eligibility data');
  console.log('─────────────────────────────────────────────────────────────');
  
  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath: '/place-hubs',
    model: {
      backHref: '/place-hubs',
      placeLabel: 'France',
      host: 'www.unknown.com',
      pageKind: 'country-hub',
      cellState: 'Unchecked',
      currentUrl: '(none)',
      verifiedLabel: '',
      mappingJson: '',
      modelContext: {
        placeKind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      },
      hostEligibility: null,
      place: { place_id: 1, place_name: 'France' },
      mapping: null,
      hidden: {
        placeId: 1,
        host: 'www.unknown.com',
        kind: 'country',
        pageKind: 'country-hub',
        placeLimit: 200,
        hostLimit: 30
      }
    }
  });

  const html = control.render();
  
  // Check for expected elements
  const checks = [
    { name: 'No eligibility card', test: () => !html.includes('data-testid="host-eligibility"') },
    { name: 'No crawl button', test: () => !html.includes('id="startCrawlBtn"') }
  ];

  let passed = 0;
  for (const check of checks) {
    const result = check.test();
    console.log(`   ${result ? '✓' : '✗'} ${check.name}`);
    if (result) passed++;
  }
  
  console.log(`\n   ${passed}/${checks.length} checks passed\n`);
  return passed === checks.length;
}

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PlaceHubGuessingCellControl Host Eligibility Check');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const results = [
    testNeedsCrawling(),
    testEligible(),
    testNoEligibilityData()
  ];
  
  const allPassed = results.every(r => r);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ${allPassed ? '✓ All tests passed' : '✗ Some tests failed'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  process.exit(allPassed ? 0 : 1);
}

main();
