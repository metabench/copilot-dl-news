'use strict';

/**
 * Ops Hub Server - Central Dashboard Launcher
 * 
 * Express server at port 3000 providing a unified entry point to all
 * operational dashboards in the system.
 * 
 * Usage:
 *   node src/ui/server/opsHub/server.js
 *   Open http://localhost:3000
 */

const express = require('express');
const path = require('path');
const http = require('http');
const jsgui = require('jsgui3-html');

const { OpsHubView } = require('./views/OpsHubView');

const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// Dashboard Registry
// ─────────────────────────────────────────────────────────────

const DASHBOARDS = [
  // Crawler Operations
  {
    category: 'Crawler Operations',
    items: [
      { name: 'Crawl Observer', port: 3007, path: 'crawlObserver', description: 'Real-time crawl monitoring with event stream', icon: '🔭' },
      { name: 'Crawler Monitor', port: 3008, path: 'crawlerMonitor', description: 'Crawler health and performance metrics', icon: '📡' },
      { name: 'Rate Limit Dashboard', port: 3120, path: 'rateLimitDashboard', description: 'Domain rate limiting status and controls', icon: '⏱️' },
    ]
  },
  // Data & Analytics
  {
    category: 'Data & Analytics',
    items: [
      { name: 'Quality Dashboard', port: 3100, path: 'qualityDashboard', description: 'Content quality scores and metrics', icon: '📊' },
      { name: 'Analytics Hub', port: 3101, path: 'analyticsHub', description: 'Aggregated analytics and insights', icon: '📈' },
      { name: 'Query Telemetry', port: 3020, path: 'queryTelemetry', description: 'Database query performance analysis', icon: '🔍' },
    ]
  },
  // Administration
  {
    category: 'Administration',
    items: [
      { name: 'Admin Dashboard', port: 3102, path: 'adminDashboard', description: 'User management, audit logs, system config', icon: '⚙️' },
      { name: 'Webhook Dashboard', port: 3121, path: 'webhookDashboard', description: 'Webhook integrations and event routing', icon: '🔗' },
      { name: 'Plugin Dashboard', port: 3122, path: 'pluginDashboard', description: 'Plugin lifecycle and management', icon: '🧩' },
    ]
  },
  // Development Tools
  {
    category: 'Development Tools',
    items: [
      { name: 'Decision Tree Viewer', port: 3030, path: 'decisionTreeViewer', description: 'Visualize classification decision trees', icon: '🌳' },
      { name: 'Template Teacher', port: 3022, path: 'templateTeacher', description: 'Train and test content extractors', icon: '🎓' },
      { name: 'Visual Diff', port: 3021, path: 'visualDiff', description: 'Compare content versions visually', icon: '🔬' },
      { name: 'Test Studio', port: 3103, path: 'testStudio', description: 'Interactive test runner and debugger', icon: '🧪' },
      { name: 'Goals Explorer', port: 3010, path: 'goalsExplorer', description: 'Project goals and progress tracking', icon: '🎯' },
    ]
  },
  // Design & Documentation
  {
    category: 'Design & Docs',
    items: [
      { name: 'Design Studio', port: 4900, path: 'designStudio', description: 'UI component design and theming', icon: '🎨' },
      { name: 'Docs Viewer', port: 4700, path: 'docsViewer', description: 'Browse project documentation', icon: '📚' },
      { name: 'Control Harness', port: 4975, path: 'controlHarness', description: 'jsgui3 control testing sandbox', icon: '🔧' },
      { name: 'Art Playground', port: 4950, path: 'artPlayground', description: 'SVG and visual experiments', icon: '🖼️' },
    ]
  }
];

// ─────────────────────────────────────────────────────────────
// Health Check - Test if a server is running
// ─────────────────────────────────────────────────────────────

async function checkServerHealth(port, timeout = 1000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: 'localhost', port, method: 'HEAD', timeout }, (res) => {
      resolve({ running: true, status: res.statusCode });
    });
    req.on('error', () => resolve({ running: false }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false }); });
    req.end();
  });
}

async function getDashboardsWithStatus() {
  const results = [];
  for (const category of DASHBOARDS) {
    const items = await Promise.all(category.items.map(async (item) => {
      const health = await checkServerHealth(item.port);
      return { ...item, ...health };
    }));
    results.push({ category: category.category, items });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Serve the hub view
app.get('/', async (req, res) => {
  try {
    const dashboards = await getDashboardsWithStatus();
    const view = new OpsHubView({ dashboards });
    const html = view.render();
    res.type('html').send(html);
  } catch (err) {
    console.error('Render error:', err);
    res.status(500).send('Error rendering dashboard');
  }
});

// API: Get dashboard status
app.get('/api/status', async (req, res) => {
  try {
    const dashboards = await getDashboardsWithStatus();
    res.json({ dashboards, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get raw registry (for clients)
app.get('/api/registry', (req, res) => {
  res.json({ dashboards: DASHBOARDS });
});

// Proxy endpoint - redirect to actual dashboard
app.get('/go/:path', (req, res) => {
  const { path: dashPath } = req.params;
  for (const cat of DASHBOARDS) {
    const found = cat.items.find(d => d.path === dashPath);
    if (found) {
      return res.redirect(`http://localhost:${found.port}`);
    }
  }
  res.status(404).send('Dashboard not found');
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Ops Hub running at http://localhost:${PORT}\n`);
    console.log('Available dashboards:');
    for (const cat of DASHBOARDS) {
      console.log(`\n  ${cat.category}:`);
      for (const d of cat.items) {
        console.log(`    ${d.icon} ${d.name} → http://localhost:${d.port}`);
      }
    }
    console.log('\n');
  });
}

module.exports = { app, DASHBOARDS, checkServerHealth, getDashboardsWithStatus };
