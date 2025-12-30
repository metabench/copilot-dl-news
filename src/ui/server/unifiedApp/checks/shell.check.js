'use strict';

/**
 * Unified Shell SSR Check Script
 * 
 * Validates that the unified shell renders correctly with sub-app navigation.
 */

const { UnifiedShell } = require('../views/UnifiedShell');
const { createSubAppRegistry } = require('../subApps/registry');

// Create shell with registry
const subApps = createSubAppRegistry();
const shell = new UnifiedShell({
  subApps,
  activeAppId: 'home'
});

const html = shell.render();

console.log('=== Unified Shell Check ===\n');

// Assertions
const assertions = [];
let passed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
  }
  assertions.push({ name, passed: condition });
}

// Structure checks
assert('Contains DOCTYPE', html.includes('<!DOCTYPE html>'));
assert('Contains title', html.includes('<title>Unified App Shell</title>'));
assert('Contains shell layout', html.includes('unified-shell'));
assert('Contains sidebar', html.includes('shell-sidebar'));
assert('Contains brand', html.includes('Control Center'));

// WLILO theme checks
assert('Contains WLILO theme vars', html.includes('--bg-obsidian') && html.includes('--gold'));
assert('Contains leather gradient', html.includes('--bg-leather'));

// Navigation structure
assert('Contains nav element', html.includes('shell-nav'));
assert('Contains nav items', html.includes('nav-item'));
assert('Contains category headers', html.includes('nav-category'));

// Sub-app entries
assert('Contains Home app', html.includes('data-app-id="home"'));
assert('Contains Rate Limits app', html.includes('data-app-id="rate-limits"'));
assert('Contains Webhooks app', html.includes('data-app-id="webhooks"'));
assert('Contains Plugins app', html.includes('data-app-id="plugins"'));

// Category labels
assert('Contains Crawler category', html.includes('Crawler'));
assert('Contains Administration category', html.includes('Administration'));
assert('Contains Analytics category', html.includes('Analytics'));
assert('Contains Development category', html.includes('Development'));

// App containers
assert('Contains app viewport', html.includes('app-viewport'));
assert('Contains app containers', html.includes('app-container'));
assert('Has hidden container class defined', html.includes('app-container--hidden'));

// Active state
assert('Home is active', html.includes('nav-item--active'));
assert('Home container is not hidden', html.includes('id="app-home"') && !html.includes('id="app-home" class="app-container--hidden"'));

// Client script
assert('Contains client script', html.includes('switchToApp'));
assert('Contains loadAppContent function', html.includes('loadAppContent'));
assert('Contains popstate handler', html.includes('popstate'));
assert('Uses history.pushState', html.includes('history.pushState'));

// Icons
assert('Contains home icon', html.includes('🏠'));
assert('Contains rate limit icon', html.includes('⏱️'));
assert('Contains webhook icon', html.includes('🔗'));
assert('Contains plugin icon', html.includes('🧩'));

// Placeholder styling
assert('Contains placeholder class', html.includes('app-placeholder'));
assert('Contains loading class', html.includes('app-loading'));

// Client handlers for sub-app buttons
assert('Has resetDomain handler', html.includes('window.resetDomain'));
assert('Has showCreateForm handler', html.includes('window.showCreateForm'));
assert('Has toggleWebhook handler', html.includes('window.toggleWebhook'));
assert('Has deleteWebhook handler', html.includes('window.deleteWebhook'));
assert('Has activatePlugin handler', html.includes('window.activatePlugin'));
assert('Has deactivatePlugin handler', html.includes('window.deactivatePlugin'));

console.log(`\n${passed}/${assertions.length} assertions passed`);

if (passed === assertions.length) {
  console.log('\n✅ Unified Shell renders correctly!');
  process.exit(0);
} else {
  console.log('\n❌ Some assertions failed');
  // Output first 3000 chars for debugging
  console.log('\n--- HTML Preview ---');
  console.log(html.slice(0, 3000) + '...');
  process.exit(1);
}
