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

function renderMultiModalPanel() {
  const html = `
    <div class="home-dashboard">
      <div class="home-hero">
        <h1>🔄 Multi-Modal Intelligent Crawl</h1>
        <p>Continuous crawl with learning loops: download batches → analyze content → learn patterns → discover hubs → repeat.</p>
      </div>

      <div class="home-stats">
        <div class="stat-card">
          <span class="stat-value" data-multimodal-stat="phase">Idle</span>
          <span class="stat-label">Current Phase</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" data-multimodal-stat="batch">0</span>
          <span class="stat-label">Batch #</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" data-multimodal-stat="pages">0</span>
          <span class="stat-label">Pages Downloaded</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" data-multimodal-stat="patterns">0</span>
          <span class="stat-label">Patterns Learned</span>
        </div>
      </div>

      <div style="margin-top: 32px;">
        <h3 style="color: var(--gold); margin-bottom: 16px; font-size: 18px;">🎮 Control Panel</h3>
        <div style="background: var(--bg-leather); border: 1px solid var(--border-gold); border-radius: 8px; padding: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Domain</label>
              <input type="text" data-multimodal-input="domain" placeholder="www.theguardian.com" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Batch Size</label>
              <input type="number" data-multimodal-input="batchSize" value="1000" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Historical Ratio (%)</label>
              <input type="number" data-multimodal-input="historical" value="30" min="0" max="100" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Max Batches (0 = unlimited)</label>
              <input type="number" data-multimodal-input="maxBatches" value="0" min="0" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Balancing Strategy</label>
              <select data-multimodal-input="strategy" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;">
                <option value="adaptive" selected>Adaptive (recommended)</option>
                <option value="fixed">Fixed Ratio</option>
                <option value="priority">Priority Mode</option>
                <option value="time-based">Time-Based</option>
              </select>
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Hub Discovery</label>
              <select data-multimodal-input="hubDiscovery" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;">
                <option value="true" selected>Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Hub Refresh Interval (minutes)</label>
              <input type="number" data-multimodal-input="hubRefreshInterval" value="60" min="5" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; color: #b8a090; font-size: 12px;">Pause Between Batches (seconds)</label>
              <input type="number" data-multimodal-input="pauseBetween" value="5" min="0" style="width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-gold); background: rgba(0,0,0,0.3); color: #f5e6d3; font-family: inherit;" />
            </div>
          </div>
          <div style="display: flex; gap: 12px; justify-content: center; margin-top: 16px;">
            <button data-multimodal-action="start" style="padding: 12px 24px; border-radius: 8px; border: 1px solid #22c55e; background: rgba(34,197,94,0.15); color: #4ade80; cursor: pointer; font-weight: 600;">
              ▶️ Start Crawl
            </button>
            <button data-multimodal-action="pause" style="padding: 12px 24px; border-radius: 8px; border: 1px solid #f59e0b; background: rgba(245,158,11,0.15); color: #fbbf24; cursor: pointer; font-weight: 600;" disabled>
              ⏸️ Pause
            </button>
            <button data-multimodal-action="stop" style="padding: 12px 24px; border-radius: 8px; border: 1px solid #ef4444; background: rgba(239,68,68,0.15); color: #f87171; cursor: pointer; font-weight: 600;" disabled>
              ⏹️ Stop
            </button>
          </div>
        </div>
      </div>

      <div style="margin-top: 32px;">
        <h3 style="color: var(--gold); margin-bottom: 16px; font-size: 18px;">📊 Phase Progress</h3>
        <div style="background: var(--bg-leather); border: 1px solid var(--border-gold); border-radius: 8px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span data-multimodal-stat="phase-label">Idle</span>
            <span data-multimodal-stat="progress-text">–</span>
          </div>
          <div style="height: 20px; background: rgba(0,0,0,0.3); border-radius: 10px; overflow: hidden; position: relative;">
            <div data-multimodal-progress-bar style="height: 100%; width: 0%; background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%); border-radius: 10px; transition: width 0.3s ease-out;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; color: #b8a090;">
            <span data-multimodal-phase-icon="downloading" style="opacity: 0.4;">📥 Download</span>
            <span data-multimodal-phase-icon="analyzing" style="opacity: 0.4;">🔍 Analyze</span>
            <span data-multimodal-phase-icon="learning" style="opacity: 0.4;">🧠 Learn</span>
            <span data-multimodal-phase-icon="discovering" style="opacity: 0.4;">🔭 Discover</span>
            <span data-multimodal-phase-icon="reanalyzing" style="opacity: 0.4;">♻️ Re-analyze</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 32px;">
        <h3 style="color: var(--gold); margin-bottom: 16px; font-size: 18px;">🧠 Learning Insights</h3>
        <div data-multimodal-insights style="background: var(--bg-leather); border: 1px solid var(--border-gold); border-radius: 8px; padding: 16px; max-height: 200px; overflow-y: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #b8a090;">
          <div style="color: #666;">No insights yet. Start a crawl to begin learning.</div>
        </div>
      </div>

      <div style="margin-top: 18px; text-align: center; color: #b8a090; font-size: 12px;" data-multimodal-status>
        Status: Ready
      </div>
    </div>
  `;

  const activationKey = 'multi-modal-crawl';
  return {
    content: wrapPanelHtml({
      appId: 'multi-modal-crawl',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

function renderDownloadsPanel() {
  const html = `
    <div class="home-dashboard">
      <div class="home-hero">
        <h1>📥 Download Statistics</h1>
        <p>Evidence-based download verification. All counts are queried directly from the database.</p>
      </div>

      <div class="home-stats">
        <div class="stat-card">
          <span class="stat-value" data-downloads-stat="total">–</span>
          <span class="stat-label">Total Downloads</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" data-downloads-stat="verified">–</span>
          <span class="stat-label">Verified (HTTP 200)</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" data-downloads-stat="bytes">–</span>
          <span class="stat-label">Total Size</span>
        </div>
      </div>

      <div style="margin-top: 32px;">
        <h3 style="color: var(--gold); margin-bottom: 16px; font-size: 18px;">📊 50-Page Crawl Progress</h3>
        <div style="background: var(--bg-leather); border: 1px solid var(--border-gold); border-radius: 8px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Progress</span>
            <span data-downloads-stat="progress-text">0 / 50</span>
          </div>
          <div style="height: 24px; background: rgba(0,0,0,0.3); border-radius: 12px; overflow: hidden; position: relative;">
            <div data-downloads-progress-bar style="height: 100%; width: 0%; background: linear-gradient(90deg, #22c55e 0%, #4ade80 100%); border-radius: 12px; transition: width 0.2s ease-out;"></div>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
            <button data-downloads-action="start-crawl" style="padding: 10px 20px; border-radius: 8px; border: 1px solid #22c55e; background: rgba(34,197,94,0.15); color: #4ade80; cursor: pointer; font-weight: 600;">
              🕷️ Start 50-Page Crawl
            </button>
            <button data-downloads-action="refresh" style="padding: 10px 14px; border-radius: 8px; border: 1px solid #8b6914; background: rgba(212,165,116,0.12); color: #f5e6d3; cursor: pointer;">
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div style="margin-top: 32px;">
        <h3 style="color: var(--gold); margin-bottom: 16px; font-size: 18px;">📝 Recent Downloads</h3>
        <div data-downloads-recent style="background: var(--bg-leather); border: 1px solid var(--border-gold); border-radius: 8px; padding: 16px; max-height: 300px; overflow-y: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #b8a090;">
          Loading...
        </div>
      </div>

      <div style="margin-top: 18px; text-align: center; color: #b8a090; font-size: 12px;" data-downloads-status>
        Last updated: –
      </div>
    </div>
  `;

  const activationKey = 'downloads';
  return {
    content: wrapPanelHtml({
      appId: 'downloads',
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
      id: 'multi-modal-crawl',
      label: 'Multi-Modal Crawl',
      icon: '🔄',
      category: 'crawler',
      description: 'Intelligent crawl with learning loops: download → analyze → learn → repeat',
      renderContent: async () => {
        return renderMultiModalPanel();
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
      id: 'crawl-strategies',
      label: 'Crawl Strategies',
      icon: '🕷️',
      category: 'crawler',
      description: 'Browse crawl operations, sequences, and configuration options',
      renderContent: async () => {
        return renderIframeApp('/crawl-strategies', 'Crawl Strategies');
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
      id: 'downloads',
      label: 'Downloads',
      icon: '📥',
      category: 'analytics',
      description: 'Verified download statistics and progress',
      renderContent: async () => {
        return renderDownloadsPanel();
      }
    },
    
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
