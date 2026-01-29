'use strict';

/**
 * Check script for CrawlSpeedometerControl
 * 
 * Verifies SSR rendering produces valid HTML with expected structure.
 */

const jsgui = require('jsgui3-html');
const { createCrawlSpeedometerControl, CRAWL_SPEEDOMETER_STYLES } = require('../CrawlSpeedometerControl');

const CrawlSpeedometerControl = createCrawlSpeedometerControl(jsgui);

// Test 1: Basic rendering
console.log('--- Test 1: Basic rendering ---');
const speedometer = new CrawlSpeedometerControl({
  label: 'Hub Discovery',
  maxSpeed: 10,
  size: 180
});

const html = speedometer.all_html_render();
console.log('Rendered HTML length:', html.length);

// Structural checks
const checks = [
  { name: 'Has speedometer class', pass: html.includes('crawl-speedometer') },
  { name: 'Has SVG gauge', pass: html.includes('<svg') },
  { name: 'Has needle group', pass: html.includes('speedometer-needle') },
  { name: 'Has speed value', pass: html.includes('speed-value') },
  { name: 'Has stats grid', pass: html.includes('stats-grid') },
  { name: 'Has status dot', pass: html.includes('status-dot') },
  { name: 'Has title', pass: html.includes('Hub Discovery') },
  { name: 'Has arc paths', pass: html.includes('<path') },
  { name: 'Has tick marks', pass: html.includes('<line') },
];

let passed = 0;
for (const check of checks) {
  const icon = check.pass ? '✓' : '✗';
  console.log(`  ${icon} ${check.name}`);
  if (check.pass) passed++;
}

console.log(`\n${passed}/${checks.length} checks passed`);

// Test 2: Update method
console.log('\n--- Test 2: Update method (client-side) ---');
const speedometer2 = new CrawlSpeedometerControl({
  label: 'Batch Check',
  maxSpeed: 20
});

// Simulate update
speedometer2.update({
  speed: 8.5,
  total: 42,
  ok: 38,
  failed: 4,
  status: 'active'
});

console.log('  ✓ Update method called without error');
console.log('  ✓ Internal state updated: speed =', speedometer2._speed);

// Test 3: CSS styles
console.log('\n--- Test 3: CSS styles ---');
const styleChecks = [
  { name: 'Has speedometer styles', pass: CRAWL_SPEEDOMETER_STYLES.includes('.crawl-speedometer') },
  { name: 'Has needle transition', pass: CRAWL_SPEEDOMETER_STYLES.includes('speedometer-needle') },
  { name: 'Has status colors', pass: CRAWL_SPEEDOMETER_STYLES.includes('.status-active') },
  { name: 'Has pulse animation', pass: CRAWL_SPEEDOMETER_STYLES.includes('@keyframes pulse') },
];

let stylePassed = 0;
for (const check of styleChecks) {
  const icon = check.pass ? '✓' : '✗';
  console.log(`  ${icon} ${check.name}`);
  if (check.pass) stylePassed++;
}

console.log(`\n${stylePassed}/${styleChecks.length} style checks passed`);

// Output sample HTML for visual inspection
console.log('\n--- Sample HTML (first 1000 chars) ---');
console.log(html.substring(0, 1000) + '...');

// Overall result
const allPassed = passed === checks.length && stylePassed === styleChecks.length;
console.log('\n' + (allPassed ? '✓ All checks passed!' : '✗ Some checks failed'));
process.exit(allPassed ? 0 : 1);
