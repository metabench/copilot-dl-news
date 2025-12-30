'use strict';

/**
 * Ops Hub SSR Check Script
 * 
 * Validates that the Ops Hub view renders correctly with mock dashboard data.
 */

const { OpsHubView } = require('../views/OpsHubView');

// Mock dashboard data with status
const mockDashboards = [
  {
    category: 'Crawler Operations',
    items: [
      { name: 'Crawl Observer', port: 3007, path: 'crawlObserver', description: 'Real-time crawl monitoring', icon: '🔭', running: true, status: 200 },
      { name: 'Crawler Monitor', port: 3008, path: 'crawlerMonitor', description: 'Crawler health metrics', icon: '📡', running: false },
      { name: 'Rate Limit Dashboard', port: 3120, path: 'rateLimitDashboard', description: 'Rate limiting controls', icon: '⏱️', running: true, status: 200 },
    ]
  },
  {
    category: 'Data & Analytics',
    items: [
      { name: 'Quality Dashboard', port: 3100, path: 'qualityDashboard', description: 'Content quality scores', icon: '📊', running: true, status: 200 },
      { name: 'Analytics Hub', port: 3101, path: 'analyticsHub', description: 'Analytics insights', icon: '📈', running: false },
    ]
  },
  {
    category: 'Administration',
    items: [
      { name: 'Admin Dashboard', port: 3102, path: 'adminDashboard', description: 'User management', icon: '⚙️', running: true, status: 200 },
      { name: 'Webhook Dashboard', port: 3121, path: 'webhookDashboard', description: 'Webhook integrations', icon: '🔗', running: true, status: 200 },
      { name: 'Plugin Dashboard', port: 3122, path: 'pluginDashboard', description: 'Plugin management', icon: '🧩', running: false },
    ]
  },
  {
    category: 'Development Tools',
    items: [
      { name: 'Decision Tree Viewer', port: 3030, path: 'decisionTreeViewer', description: 'Classification trees', icon: '🌳', running: false },
      { name: 'Test Studio', port: 3103, path: 'testStudio', description: 'Interactive testing', icon: '🧪', running: true, status: 200 },
    ]
  },
  {
    category: 'Design & Docs',
    items: [
      { name: 'Design Studio', port: 4900, path: 'designStudio', description: 'UI theming', icon: '🎨', running: false },
      { name: 'Docs Viewer', port: 4700, path: 'docsViewer', description: 'Documentation', icon: '📚', running: true, status: 200 },
    ]
  }
];

console.log('=== Ops Hub Check ===\n');

const view = new OpsHubView({ dashboards: mockDashboards });
const html = view.render();

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
assert('Contains title', html.includes('<title>Ops Hub'));
assert('Contains hub header', html.includes('hub-header'));
assert('Contains hub title', html.includes('Ops Hub'));
assert('Contains WLILO theme vars', html.includes('--bg-obsidian') && html.includes('--gold'));

// Stats checks
assert('Contains stats bar', html.includes('stats-bar'));
assert('Shows total count (12)', html.includes('12</span>') || html.includes('>12<'));

// Category checks
assert('Contains Crawler Operations', html.includes('Crawler Operations'));
assert('Contains Data & Analytics', html.includes('Data &amp; Analytics') || html.includes('Data & Analytics'));
assert('Contains Administration', html.includes('Administration'));
assert('Contains Development Tools', html.includes('Development Tools'));
assert('Contains Design & Docs', html.includes('Design &amp; Docs') || html.includes('Design & Docs'));

// Dashboard card checks
assert('Contains Crawl Observer card', html.includes('Crawl Observer'));
assert('Contains Rate Limit Dashboard card', html.includes('Rate Limit Dashboard'));
assert('Contains Admin Dashboard card', html.includes('Admin Dashboard'));
assert('Contains Webhook Dashboard card', html.includes('Webhook Dashboard'));
assert('Contains Plugin Dashboard card', html.includes('Plugin Dashboard'));

// Status indicator checks
assert('Contains online status class', html.includes('class="card-status online"'));
assert('Contains offline status class', html.includes('class="card-status offline"'));
assert('Contains offline card class', html.includes('dashboard-card offline'));

// Port display checks
assert('Shows port 3007', html.includes(':3007'));
assert('Shows port 3120', html.includes(':3120'));
assert('Shows port 3121', html.includes(':3121'));
assert('Shows port 3122', html.includes(':3122'));

// Quick launch checks (should have online dashboards)
assert('Contains quick launch section', html.includes('quick-launch'));
assert('Quick launch has online button', html.includes('quick-btn online'));

// Icon checks
assert('Contains crawler icon', html.includes('🔭') || html.includes('&#x1F52D'));
assert('Contains rate limit icon', html.includes('⏱️') || html.includes('&#x23F1'));
assert('Contains webhook icon', html.includes('🔗') || html.includes('&#x1F517'));
assert('Contains plugin icon', html.includes('🧩') || html.includes('&#x1F9E9'));

// Interactive elements
assert('Contains refresh button', html.includes('refresh-btn'));
assert('Contains auto-refresh script', html.includes('setTimeout'));

console.log(`\n${passed}/${assertions.length} assertions passed`);

if (passed === assertions.length) {
  console.log('\n✅ Ops Hub renders correctly!');
  process.exit(0);
} else {
  console.log('\n❌ Some assertions failed');
  process.exit(1);
}
