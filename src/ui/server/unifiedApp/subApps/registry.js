'use strict';

/**
 * Sub-App Registry
 * 
 * Defines all sub-applications that can be hosted in the unified shell.
 * Each app provides:
 * - id: Unique identifier
 * - label: Display name
 * - icon: Emoji icon
 * - category: Navigation grouping
 * - description: Short description
 * - renderContent: Function that returns HTML content for the app
 */

const jsgui = require('jsgui3-html');

/**
 * Create the sub-app registry
 * @returns {Array} Array of sub-app definitions
 */
function createSubAppRegistry() {
  return [
    // ─────────────────────────────────────────────────────────────
    // Home / Dashboard
    // ─────────────────────────────────────────────────────────────
    {
      id: 'home',
      label: 'Home',
      icon: '🏠',
      category: 'main',
      description: 'System overview and quick actions',
      renderContent: async () => {
        return `
          <div class="home-dashboard">
            <div class="home-hero">
              <h1>🎛️ Unified Control Center</h1>
              <p>Welcome to the unified application shell. Select a sub-app from the sidebar to get started.</p>
            </div>
            <div class="home-stats">
              <div class="stat-card">
                <span class="stat-value">18</span>
                <span class="stat-label">Available Apps</span>
              </div>
              <div class="stat-card">
                <span class="stat-value">5</span>
                <span class="stat-label">Categories</span>
              </div>
              <div class="stat-card">
                <span class="stat-value">0</span>
                <span class="stat-label">Active Tasks</span>
              </div>
            </div>
          </div>
        `;
      }
    },
    
    // ─────────────────────────────────────────────────────────────
    // Crawler Operations
    // ─────────────────────────────────────────────────────────────
    {
      id: 'rate-limits',
      label: 'Rate Limits',
      icon: '⏱️',
      category: 'crawler',
      description: 'Domain rate limiting status and controls',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/rate-limit" title="Rate Limits" loading="lazy"></iframe>`;
      }
    },
    
    {
      id: 'crawl-observer',
      label: 'Crawl Observer',
      icon: '🔭',
      category: 'crawler',
      description: 'Real-time crawl monitoring with event stream',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>🔭 Crawl Observer</p><p>Real-time crawl monitoring - loads from port 3007</p></div>`;
      }
    },
    
    {
      id: 'crawler-monitor',
      label: 'Crawler Monitor',
      icon: '📡',
      category: 'crawler',
      description: 'Crawler health and performance metrics',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>📡 Crawler Monitor</p><p>Health and performance metrics</p></div>`;
      }
    },
    
    // ─────────────────────────────────────────────────────────────
    // Administration
    // ─────────────────────────────────────────────────────────────
    {
      id: 'webhooks',
      label: 'Webhooks',
      icon: '🔗',
      category: 'admin',
      description: 'Webhook integrations and event routing',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/webhooks" title="Webhooks" loading="lazy"></iframe>`;
      }
    },
    
    {
      id: 'plugins',
      label: 'Plugins',
      icon: '🧩',
      category: 'admin',
      description: 'Plugin lifecycle and management',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/plugins" title="Plugins" loading="lazy"></iframe>`;
      }
    },
    
    {
      id: 'admin',
      label: 'Admin',
      icon: '⚙️',
      category: 'admin',
      description: 'User management, audit logs, system config',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>⚙️ Admin Dashboard</p><p>User management and system configuration</p></div>`;
      }
    },
    
    // ─────────────────────────────────────────────────────────────
    // Data & Analytics
    // ─────────────────────────────────────────────────────────────
    {
      id: 'quality',
      label: 'Quality',
      icon: '📊',
      category: 'analytics',
      description: 'Content quality scores and metrics',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/quality" title="Quality" loading="lazy"></iframe>`;
      }
    },
    
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '📈',
      category: 'analytics',
      description: 'Aggregated analytics and insights',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/analytics" title="Analytics" loading="lazy"></iframe>`;
      }
    },
    
    {
      id: 'query-telemetry',
      label: 'Query Telemetry',
      icon: '🔍',
      category: 'analytics',
      description: 'Database query performance analysis',
      renderContent: async () => {
        return `<iframe class="app-embed" src="/telemetry" title="Query Telemetry" loading="lazy"></iframe>`;
      }
    },
    
    // ─────────────────────────────────────────────────────────────
    // Development Tools
    // ─────────────────────────────────────────────────────────────
    {
      id: 'decision-tree',
      label: 'Decision Tree',
      icon: '🌳',
      category: 'dev',
      description: 'Visualize classification decision trees',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>🌳 Decision Tree Viewer</p><p>Classification visualization</p></div>`;
      }
    },
    
    {
      id: 'template-teacher',
      label: 'Template Teacher',
      icon: '🎓',
      category: 'dev',
      description: 'Train and test content extractors',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>🎓 Template Teacher</p><p>Extractor training UI</p></div>`;
      }
    },
    
    {
      id: 'test-studio',
      label: 'Test Studio',
      icon: '🧪',
      category: 'dev',
      description: 'Interactive test runner and debugger',
      renderContent: async () => {
        return `<div class="app-placeholder"><p>🧪 Test Studio</p><p>Interactive testing</p></div>`;
      }
    }
  ];
}

/**
 * Get category metadata
 */
const CATEGORIES = {
  main: { label: 'Main', icon: '🏠' },
  crawler: { label: 'Crawler', icon: '🕷️' },
  admin: { label: 'Administration', icon: '⚙️' },
  analytics: { label: 'Analytics', icon: '📊' },
  dev: { label: 'Development', icon: '🛠️' }
};

module.exports = { createSubAppRegistry, CATEGORIES };
