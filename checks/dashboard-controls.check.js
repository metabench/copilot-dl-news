#!/usr/bin/env node
/**
 * Dashboard Controls Check Script
 * 
 * Validates that the dashboard controls:
 * 1. Can be instantiated with jsgui3
 * 2. Produce valid HTML
 * 3. Include required CSS classes for anti-jitter
 * 4. Support the expected API methods
 */

const jsgui = require('jsgui3-html');
const { createDashboardControls, STYLES } = require('../src/ui/controls/dashboard');

const { ProgressBar, StatusBadge, StatsGrid, ProgressCard } = createDashboardControls(jsgui);

console.log('=== Dashboard Controls Check ===\n');

// Helper to check HTML contains expected patterns
function assertContains(html, pattern, message) {
  if (!html.includes(pattern)) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`   Expected to find: ${pattern}`);
    return false;
  }
  return true;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result !== false) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

// === ProgressBar Tests ===
console.log('--- ProgressBar ---');

test('ProgressBar instantiation', () => {
  const bar = new ProgressBar({ size: 'medium', variant: 'crawl' });
  if (!bar) throw new Error('Failed to create');
});

test('ProgressBar renders HTML', () => {
  const bar = new ProgressBar({ size: 'medium' });
  const html = bar.all_html_render();
  return assertContains(html, 'dprogress', 'Should have dprogress class');
});

test('ProgressBar has anti-jitter class', () => {
  const bar = new ProgressBar();
  const html = bar.all_html_render();
  // The fill div should have transform style for GPU animation
  return assertContains(html, 'dprogress__fill', 'Should have progress fill element');
});

test('ProgressBar setProgress method', () => {
  const bar = new ProgressBar();
  bar.setProgress(50, 100);
  // The control stores state in _state object
  if (bar._state.current !== 50 || bar._state.total !== 100) {
    throw new Error('setProgress did not update state');
  }
});

// === StatusBadge Tests ===
console.log('\n--- StatusBadge ---');

test('StatusBadge instantiation', () => {
  const badge = new StatusBadge({ status: 'running' });
  if (!badge) throw new Error('Failed to create');
});

test('StatusBadge renders HTML', () => {
  const badge = new StatusBadge({ status: 'idle' });
  const html = badge.all_html_render();
  return assertContains(html, 'dstatus', 'Should have dstatus class');
});

test('StatusBadge setStatus method', () => {
  const badge = new StatusBadge({ status: 'idle' });
  badge.setStatus('running');
  if (badge._status !== 'running') {
    throw new Error('setStatus did not update state');
  }
});

// === StatsGrid Tests ===
console.log('\n--- StatsGrid ---');

test('StatsGrid instantiation', () => {
  const grid = new StatsGrid();
  if (!grid) throw new Error('Failed to create');
});

test('StatsGrid addStat', () => {
  const grid = new StatsGrid();
  grid.addStat({ id: 'pages', label: 'Pages', value: 0 });
  if (!grid._stats.has('pages')) {
    throw new Error('addStat did not add stat');
  }
});

test('StatsGrid updateStat', () => {
  const grid = new StatsGrid();
  grid.addStat({ id: 'pages', label: 'Pages', value: 0 });
  grid.updateStat('pages', 42);
  if (grid._stats.get('pages').value !== 42) {
    throw new Error('updateStat did not update value');
  }
});

test('StatsGrid renders HTML', () => {
  const grid = new StatsGrid();
  grid.addStat({ id: 'pages', label: 'Pages', value: 0 });
  const html = grid.all_html_render();
  return assertContains(html, 'dstats', 'Should have dstats class');
});

// === ProgressCard Tests ===
console.log('\n--- ProgressCard ---');

test('ProgressCard instantiation', () => {
  const card = new ProgressCard(
    { title: 'Test Card' },
    { ProgressBar, StatusBadge, StatsGrid }
  );
  if (!card) throw new Error('Failed to create');
});

test('ProgressCard renders HTML', () => {
  const card = new ProgressCard(
    { title: 'Test Card' },
    { ProgressBar, StatusBadge, StatsGrid }
  );
  const html = card.all_html_render();
  return assertContains(html, 'dcard', 'Should have dcard class') &&
         assertContains(html, 'Test Card', 'Should contain title');
});

test('ProgressCard setState', () => {
  const card = new ProgressCard(
    { title: 'Test' },
    { ProgressBar, StatusBadge, StatsGrid }
  );
  card.setState({ status: 'running', current: 50, total: 100 });
  if (card._state.status !== 'running' || card._state.current !== 50) {
    throw new Error('setState did not update state');
  }
});

// === STYLES Tests ===
console.log('\n--- Styles ---');

test('STYLES contains anti-jitter patterns', () => {
  return assertContains(STYLES, 'contain:', 'Should have CSS containment') &&
         assertContains(STYLES, 'font-variant-numeric', 'Should have tabular-nums') &&
         assertContains(STYLES, 'will-change', 'Should have will-change for GPU');
});

test('STYLES contains custom properties', () => {
  return assertContains(STYLES, '--dprogress-', 'Should have progress custom props') &&
         assertContains(STYLES, '--dstatus-', 'Should have status custom props');
});

// === Summary ===
console.log('\n=== Summary ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✨ All dashboard controls validated!');
