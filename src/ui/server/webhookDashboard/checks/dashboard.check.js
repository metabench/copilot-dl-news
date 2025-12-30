'use strict';

/**
 * Webhook Dashboard Check Script
 * 
 * Renders the dashboard with mock data to verify SSR output.
 * 
 * Usage:
 *   node src/ui/server/webhookDashboard/checks/dashboard.check.js
 */

const { WebhookDashboard } = require('../views/WebhookDashboard');

// Mock webhooks
const mockWebhooks = [
  {
    id: 1,
    name: 'Slack Notifications',
    url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
    events: ['article:new', 'breaking_news', 'alert:triggered'],
    enabled: true,
    userId: 1,
    createdAt: '2025-01-15T10:00:00Z'
  },
  {
    id: 2,
    name: 'Analytics Pipeline',
    url: 'https://analytics.example.com/webhook',
    events: ['crawl:completed', 'export:ready'],
    enabled: true,
    userId: 1,
    createdAt: '2025-01-10T08:30:00Z'
  },
  {
    id: 3,
    name: 'Legacy Integration (Disabled)',
    url: 'https://old-system.internal/events',
    events: ['article:new'],
    enabled: false,
    userId: 1,
    createdAt: '2024-12-01T12:00:00Z'
  }
];

const mockEventTypes = [
  'article:new',
  'article:updated',
  'alert:triggered',
  'breaking_news',
  'crawl:completed',
  'export:ready'
];

const mockMetrics = {
  total: mockWebhooks.length,
  enabled: mockWebhooks.filter(w => w.enabled).length,
  disabled: mockWebhooks.filter(w => !w.enabled).length,
  eventTypes: mockEventTypes.length
};

// Create dashboard
const dashboard = new WebhookDashboard({
  webhooks: mockWebhooks,
  metrics: mockMetrics,
  eventTypes: mockEventTypes
});

// Render
const html = dashboard.all_html_render();

// Assertions
console.log('=== Webhook Dashboard Check ===\n');

const assertions = [
  ['Contains hub navigation', html.includes('hub-nav')],
  ['Links to Ops Hub', html.includes('localhost:3000')],
  ['Contains header', html.includes('Webhook Management')],
  ['Contains metrics row', html.includes('metrics-row')],
  ['Shows total webhooks', html.includes('Total Webhooks')],
  ['Shows active count', html.includes('Active')],
  ['Contains webhook grid', html.includes('webhook-grid')],
  ['Shows Slack Notifications', html.includes('Slack Notifications')],
  ['Shows webhook URL', html.includes('hooks.slack.com')],
  ['Contains event badges', html.includes('event-badge')],
  ['Shows article:new event', html.includes('article:new')],
  ['Contains create button', html.includes('New Webhook')],
  ['Contains delete button', html.includes('Delete')],
  ['Shows enabled status', html.includes('webhook-card__status--enabled')],
  ['Shows disabled status', html.includes('webhook-card__status--disabled')],
  ['Contains create modal', html.includes('createModal')],
  ['Contains event checkboxes', html.includes('type="checkbox"')]
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
