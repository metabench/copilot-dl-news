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
const { SubAppFrame } = require('../components/SubAppFrame');
const { SubAppPlaceholder } = require('../components/SubAppPlaceholder');
const { wrapPanelHtml } = require('./panelContract');

function renderIframeApp(src, title) {
  const context = new jsgui.Page_Context();
  const frame = new SubAppFrame({ context, src, title, loading: 'lazy' });
  return {
    content: frame.render(),
    embed: 'iframe'
  };
}

function renderPlaceholder(appId, title, subtitle) {
  const context = new jsgui.Page_Context();
  const placeholder = new SubAppPlaceholder({ context, title, subtitle });
  const activationKey = 'placeholder';
  return {
    content: wrapPanelHtml({
      appId,
      activationKey,
      html: placeholder.render()
    }),
    embed: 'panel',
    activationKey
  };
}

function renderHomePanel(html) {
  const activationKey = 'home';
  return {
    content: wrapPanelHtml({
      appId: 'home',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

function renderDemoPanel() {
  const html = `
    <div class="home-dashboard">
      <div class="home-hero">
        <h1>🧪 Panel Demo</h1>
        <p>This panel proves the unified shell activation seam works without relying on <code>&lt;script&gt;</code> execution.</p>
      </div>

      <div class="home-stats">
        <div class="stat-card">
          <span class="stat-value">✓</span>
          <span class="stat-label">Activation</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">0</span>
          <span class="stat-label">Clicks</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">–</span>
          <span class="stat-label">Last Ping</span>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
        <button data-panel-demo-action="ping" style="padding: 10px 14px; border-radius: 8px; border: 1px solid #8b6914; background: rgba(212,165,116,0.12); color: #f5e6d3; cursor: pointer;">
          Ping
        </button>
        <button data-panel-demo-action="reset" style="padding: 10px 14px; border-radius: 8px; border: 1px solid #8b6914; background: rgba(212,165,116,0.06); color: #f5e6d3; cursor: pointer;">
          Reset
        </button>
      </div>

      <div style="margin-top: 18px; text-align: center; color: #b8a090; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;" data-panel-demo-output>
        Waiting for activation…
      </div>
    </div>
  `;

  const activationKey = 'panel-demo';
  return {
    content: wrapPanelHtml({
      appId: 'panel-demo',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

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
        return renderHomePanel(`
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
                <span class="stat-value" data-home-stat="activeCrawlJobs">–</span>
                <span class="stat-label">Active Crawl Jobs</span>
              </div>
              <div class="stat-card">
                <span class="stat-value" data-home-stat="crawlHealth">…</span>
                <span class="stat-label">Crawl Health</span>
              </div>
            </div>

            <div class="home-alert" data-home-crawl-alert style="display:none; margin-top: 14px; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,122,122,0.55); background: rgba(255,122,122,0.10); color: #ffd0d0;">
              <strong style="margin-right: 8px;">Last crawl error</strong>
              <span data-home-crawl-error-message class="mono">–</span>
              <a href="/?app=crawl-status" style="margin-left: 10px; color: #ffd0d0; text-decoration: underline;">Open Crawl Status</a>
            </div>
          </div>
        `);
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
        return renderIframeApp('/rate-limit', 'Rate Limits');
      }
    },
    
    {
      id: 'crawl-observer',
      label: 'Crawl Observer',
      icon: '🔭',
      category: 'crawler',
      description: 'Real-time crawl monitoring with event stream',
      renderContent: async () => {
        return renderIframeApp('/crawl-observer', 'Crawl Observer');
      }
    },

    {
      id: 'crawl-status',
      label: 'Crawl Status',
      icon: '🏃',
      category: 'crawler',
      description: 'Start crawl operations and view real-time progress',
      renderContent: async () => {
        return renderIframeApp('/crawl-status', 'Crawl Status');
      }
    },

    {
      id: 'scheduler',
      label: 'Scheduler',
      icon: '🗓️',
      category: 'crawler',
      description: 'Schedules + reconciliation (catch-up / postpone) observability',
      renderContent: async () => {
        return renderIframeApp('/scheduler', 'Scheduler');
      }
    },

    {
      id: 'crawler-profiles',
      label: 'Crawler Profiles',
      icon: '🗃️',
      category: 'crawler',
      description: 'DB-backed crawl presets (start URL + operation + overrides)',
      renderContent: async () => {
        return renderIframeApp('/crawler-profiles', 'Crawler Profiles');
      }
    },
    
    {
      id: 'crawler-monitor',
      label: 'Crawler Monitor',
      icon: '📡',
      category: 'crawler',
      description: 'Crawler health and performance metrics',
      renderContent: async () => {
        return renderPlaceholder('crawler-monitor', '📡 Crawler Monitor', 'Health and performance metrics');
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
        return renderIframeApp('/webhooks', 'Webhooks');
      }
    },
    
    {
      id: 'plugins',
      label: 'Plugins',
      icon: '🧩',
      category: 'admin',
      description: 'Plugin lifecycle and management',
      renderContent: async () => {
        return renderIframeApp('/plugins', 'Plugins');
      }
    },
    
    {
      id: 'admin',
      label: 'Admin',
      icon: '⚙️',
      category: 'admin',
      description: 'User management, audit logs, system config',
      renderContent: async () => {
        return renderPlaceholder('admin', '⚙️ Admin Dashboard', 'User management and system configuration');
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
        return renderIframeApp('/quality', 'Quality');
      }
    },
    
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '📈',
      category: 'analytics',
      description: 'Aggregated analytics and insights',
      renderContent: async () => {
        return renderIframeApp('/analytics', 'Analytics');
      }
    },

    {
      id: 'place-hub-guessing',
      label: 'Place Hub Guessing',
      icon: '🧭',
      category: 'analytics',
      description: 'Coverage matrix for place hub mappings',
      renderContent: async () => {
        return renderIframeApp('/place-hubs', 'Place Hub Guessing');
      }
    },

    {
      id: 'topic-hub-guessing',
      label: 'Topic Hub Guessing',
      icon: '🏷️',
      category: 'analytics',
      description: 'Coverage matrix for topic hub mappings',
      renderContent: async () => {
        return renderIframeApp('/topic-hubs', 'Topic Hub Guessing');
      }
    },

    {
      id: 'topic-lists',
      label: 'Topic Lists',
      icon: '🗂️',
      category: 'admin',
      description: 'Edit multilingual topic list labels',
      renderContent: async () => {
        return renderIframeApp('/topic-lists', 'Topic Lists');
      }
    },
    
    {
      id: 'query-telemetry',
      label: 'Query Telemetry',
      icon: '🔍',
      category: 'analytics',
      description: 'Database query performance analysis',
      renderContent: async () => {
        return renderIframeApp('/telemetry', 'Query Telemetry');
      }
    },
    
    // ─────────────────────────────────────────────────────────────
    // Development Tools
    // ─────────────────────────────────────────────────────────────
    {
      id: 'docs',
      label: 'Docs',
      icon: '📚',
      category: 'dev',
      description: 'Browse repo documentation in-app',
      renderContent: async () => {
        return renderIframeApp('/docs', 'Docs');
      }
    },

    {
      id: 'design',
      label: 'Design Studio',
      icon: '🎨',
      category: 'dev',
      description: 'Browse design assets (SVG/PNG) in-app',
      renderContent: async () => {
        return renderIframeApp('/design', 'Design Studio');
      }
    },

    {
      id: 'panel-demo',
      label: 'Panel Demo',
      icon: '🧪',
      category: 'dev',
      description: 'Proof-of-life for embedded panel activation (no iframe)',
      renderContent: async () => {
        return renderDemoPanel();
      }
    },

    {
      id: 'decision-tree',
      label: 'Decision Tree',
      icon: '🌳',
      category: 'dev',
      description: 'Visualize classification decision trees',
      renderContent: async () => {
        return renderPlaceholder('decision-tree', '🌳 Decision Tree Viewer', 'Classification visualization');
      }
    },
    
    {
      id: 'template-teacher',
      label: 'Template Teacher',
      icon: '🎓',
      category: 'dev',
      description: 'Train and test content extractors',
      renderContent: async () => {
        return renderPlaceholder('template-teacher', '🎓 Template Teacher', 'Extractor training UI');
      }
    },
    
    {
      id: 'test-studio',
      label: 'Test Studio',
      icon: '🧪',
      category: 'dev',
      description: 'Interactive test runner and debugger',
      renderContent: async () => {
        return renderPlaceholder('test-studio', '🧪 Test Studio', 'Interactive testing');
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
