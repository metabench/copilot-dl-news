'use strict';

/**
 * Rate Limit Dashboard Check Script
 * 
 * Renders the dashboard with mock data to verify SSR output.
 * 
 * Usage:
 *   node src/ui/server/rateLimitDashboard/checks/dashboard.check.js
 */

const { RateLimitDashboard } = require('../views/RateLimitDashboard');

// Mock data simulating various rate limit states
const mockMetrics = {
  totalRequests: 15847,
  totalRateLimits: 42,
  totalFailures: 13,
  domainsTracked: 8
};

const mockDomains = [
  {
    domain: 'news.ycombinator.com',
    currentIntervalMs: 15000,
    rateLimitHits: 12,
    totalRequests: 234,
    consecutiveSuccess: 0,
    consecutiveFails: 2,
    lastRequest: Date.now() - 5000,
    status: 'severe'
  },
  {
    domain: 'reuters.com',
    currentIntervalMs: 3500,
    rateLimitHits: 5,
    totalRequests: 156,
    consecutiveSuccess: 2,
    consecutiveFails: 0,
    lastRequest: Date.now() - 30000,
    status: 'elevated'
  },
  {
    domain: 'bbc.com',
    currentIntervalMs: 1000,
    rateLimitHits: 1,
    totalRequests: 892,
    consecutiveSuccess: 15,
    consecutiveFails: 0,
    lastRequest: Date.now() - 2000,
    status: 'normal'
  },
  {
    domain: 'cnn.com',
    currentIntervalMs: 1000,
    rateLimitHits: 0,
    totalRequests: 445,
    consecutiveSuccess: 8,
    consecutiveFails: 0,
    lastRequest: Date.now() - 60000,
    status: 'normal'
  },
  {
    domain: 'theguardian.com',
    currentIntervalMs: 2000,
    rateLimitHits: 3,
    totalRequests: 321,
    consecutiveSuccess: 4,
    consecutiveFails: 0,
    lastRequest: Date.now() - 120000,
    status: 'elevated'
  }
];

const mockThrottled = mockDomains
  .filter(d => d.status !== 'normal')
  .map(d => ({
    domain: d.domain,
    interval: d.currentIntervalMs,
    hits: d.rateLimitHits,
    lastRateLimitAt: d.lastRequest
  }));

// Create dashboard
const dashboard = new RateLimitDashboard({
  metrics: mockMetrics,
  domains: mockDomains,
  throttled: mockThrottled
});

// Render
const html = dashboard.all_html_render();

// Assertions
console.log('=== Rate Limit Dashboard Check ===\n');

const assertions = [
  ['Contains hub navigation', html.includes('hub-nav')],
  ['Links to Ops Hub', html.includes('localhost:3000')],
  ['Contains header', html.includes('Rate Limit Dashboard')],
  ['Contains metrics row', html.includes('metrics-row')],
  ['Shows domains tracked', html.includes('Domains Tracked')],
  ['Shows rate limit hits', html.includes('Rate Limits Hit')],
  ['Contains throttled section', html.includes('Throttled Domains')],
  ['Shows news.ycombinator.com', html.includes('news.ycombinator.com')],
  ['Contains domain table', html.includes('domain-table')],
  ['Contains reset button', html.includes('btn--reset')],
  ['Shows interval badge', html.includes('interval-badge')],
  ['Contains 429 column', html.includes('429 Hits')],
  ['Shows severe badge', html.includes('interval-badge--severe')],
  ['Shows normal badge', html.includes('interval-badge--normal')]
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
  console.log('\n--- Generated HTML ---');
  console.log(html.slice(0, 2000) + '...');
  process.exit(1);
}

console.log('\n✅ Dashboard renders correctly!');
