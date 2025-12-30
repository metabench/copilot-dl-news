'use strict';

/**
 * Plugin Dashboard Check Script
 * 
 * Renders the dashboard with mock data to verify SSR output.
 * 
 * Usage:
 *   node src/ui/server/pluginDashboard/checks/dashboard.check.js
 */

const { PluginDashboard } = require('../views/PluginDashboard');

// Mock plugins
const mockPlugins = [
  {
    id: 'news-extractor-nyt',
    name: 'NYT Extractor',
    version: '1.2.0',
    type: 'extractor',
    description: 'Specialized extractor for New York Times articles',
    state: 'active',
    error: null
  },
  {
    id: 'sentiment-analyzer',
    name: 'Sentiment Analyzer',
    version: '0.9.5',
    type: 'analyzer',
    description: 'ML-based sentiment analysis for headlines',
    state: 'loaded',
    error: null
  },
  {
    id: 'slack-integration',
    name: 'Slack Integration',
    version: '2.0.1',
    type: 'integration',
    description: 'Post breaking news alerts to Slack channels',
    state: 'active',
    error: null
  },
  {
    id: 'topic-widget',
    name: 'Topic Cloud Widget',
    version: '1.0.0',
    type: 'ui-widget',
    description: 'Visual topic cloud for the dashboard',
    state: 'discovered',
    error: null
  },
  {
    id: 'broken-plugin',
    name: 'Broken Plugin',
    version: '0.1.0',
    type: 'analyzer',
    description: 'This plugin failed to load',
    state: 'error',
    error: 'Module not found: missing-dependency'
  }
];

const mockMetrics = {
  total: mockPlugins.length,
  active: mockPlugins.filter(p => p.state === 'active').length,
  errors: mockPlugins.filter(p => p.state === 'error').length,
  typeBreakdown: {
    extractor: 1,
    analyzer: 2,
    integration: 1,
    'ui-widget': 1
  }
};

// Create dashboard
const dashboard = new PluginDashboard({
  plugins: mockPlugins,
  metrics: mockMetrics
});

// Render
const html = dashboard.all_html_render();

// Assertions
console.log('=== Plugin Dashboard Check ===\n');

const assertions = [
  ['Contains hub navigation', html.includes('hub-nav')],
  ['Links to Ops Hub', html.includes('localhost:3000')],
  ['Contains header', html.includes('Plugin Manager')],
  ['Contains metrics row', html.includes('metrics-row')],
  ['Shows total plugins', html.includes('Total Plugins')],
  ['Shows active count', html.includes('Active')],
  ['Shows errors count', html.includes('Errors')],
  ['Contains plugin table', html.includes('plugin-table')],
  ['Shows NYT Extractor', html.includes('NYT Extractor')],
  ['Shows Sentiment Analyzer', html.includes('Sentiment Analyzer')],
  ['Contains type badges', html.includes('type-badge')],
  ['Shows extractor type', html.includes('type-badge--extractor')],
  ['Shows analyzer type', html.includes('type-badge--analyzer')],
  ['Shows integration type', html.includes('type-badge--integration')],
  ['Shows ui-widget type', html.includes('type-badge--ui-widget')],
  ['Contains state badges', html.includes('state-badge')],
  ['Shows active state', html.includes('state-badge--active')],
  ['Shows error state', html.includes('state-badge--error')],
  ['Contains activate button', html.includes('Activate')],
  ['Contains deactivate button', html.includes('Deactivate')],
  ['Contains discover button', html.includes('Discover Plugins')],
  ['Shows version tag', html.includes('version-tag')]
];

let passed = 0;
let failed = 0;

for (const [name, result] of assertions) {
  const icon = result ? '✓' : '✗';
  const color = result ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${name}`);
  if (result) passed++;
  else failed++;
}

console.log(`\n${passed}/${assertions.length} assertions passed`);

if (failed > 0) {
  console.log('\n--- Generated HTML (first 2000 chars) ---');
  console.log(html.slice(0, 2000) + '...');
  process.exit(1);
}

console.log('\n✅ Dashboard renders correctly!');
