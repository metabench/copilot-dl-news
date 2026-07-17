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
const { renderStatCard, renderStatsRow, renderPanelHero } = require('./panelHelpers');
const { SearchExplorerControl } = require('../../../controls/SearchExplorerControl');
const { DownloadVerificationPanelControl } = require('../../../controls/DownloadVerificationPanelControl');
const { CloudCrawlPanelControl } = require('../../../controls/CloudCrawlPanelControl');
const { ScreenshotReviewPanelControl } = require('../../../controls/ScreenshotReviewPanelControl');
const { getUnifiedAppHomeDashboardCounts } = require('news-crawler-db');

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
      ${renderPanelHero({
    title: '🧪 Panel Demo',
    description: 'This panel proves the unified shell activation seam works without relying on <code>&lt;script&gt;</code> execution.'
  })}

      ${renderStatsRow([
    { value: '✓', label: 'Activation' },
    { value: '0', label: 'Clicks' },
    { value: '–', label: 'Last Ping' }
  ])}

      <div class="panel-btn-row mt-24">
        <button data-panel-demo-action="ping" class="panel-btn panel-btn--default">
          Ping
        </button>
        <button data-panel-demo-action="reset" class="panel-btn panel-btn--ghost">
          Reset
        </button>
      </div>

      <div class="panel-status mono" data-panel-demo-output>
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
      ${renderPanelHero({
    title: '🔄 Multi-Modal Intelligent Crawl',
    description: 'Continuous crawl with learning loops: download batches → analyze content → learn patterns → discover hubs → repeat.'
  })}

      ${renderStatsRow([
    { value: 'Idle', label: 'Current Phase', valueAttrs: { 'data-multimodal-stat': 'phase' } },
    { value: '0', label: 'Batch #', valueAttrs: { 'data-multimodal-stat': 'batch' } },
    { value: '0', label: 'Pages Downloaded', valueAttrs: { 'data-multimodal-stat': 'pages' } },
    { value: '0', label: 'Patterns Learned', valueAttrs: { 'data-multimodal-stat': 'patterns' } }
  ])}

      <div class="panel-section">
        <h3 class="panel-section__title">🎮 Control Panel</h3>
        <div class="panel-card">
          <div class="panel-form-grid">
            <div>
              <label class="panel-label">Domain</label>
              <input type="text" data-multimodal-input="domain" placeholder="www.theguardian.com" class="panel-input" />
            </div>
            <div>
              <label class="panel-label">Batch Size</label>
              <input type="number" data-multimodal-input="batchSize" value="1000" class="panel-input" />
            </div>
          </div>
          <div class="panel-form-grid">
            <div>
              <label class="panel-label">Historical Ratio (%)</label>
              <input type="number" data-multimodal-input="historical" value="30" min="0" max="100" class="panel-input" />
            </div>
            <div>
              <label class="panel-label">Max Batches (0 = unlimited)</label>
              <input type="number" data-multimodal-input="maxBatches" value="0" min="0" class="panel-input" />
            </div>
          </div>
          <div class="panel-form-grid">
            <div>
              <label class="panel-label">Balancing Strategy</label>
              <select data-multimodal-input="strategy" class="panel-select">
                <option value="adaptive" selected>Adaptive (recommended)</option>
                <option value="fixed">Fixed Ratio</option>
                <option value="priority">Priority Mode</option>
                <option value="time-based">Time-Based</option>
              </select>
            </div>
            <div>
              <label class="panel-label">Hub Discovery</label>
              <select data-multimodal-input="hubDiscovery" class="panel-select">
                <option value="true" selected>Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
          <div class="panel-form-grid">
            <div>
              <label class="panel-label">Hub Refresh Interval (minutes)</label>
              <input type="number" data-multimodal-input="hubRefreshInterval" value="60" min="5" class="panel-input" />
            </div>
            <div>
              <label class="panel-label">Pause Between Batches (seconds)</label>
              <input type="number" data-multimodal-input="pauseBetween" value="5" min="0" class="panel-input" />
            </div>
          </div>
          <div class="panel-btn-row">
            <button data-multimodal-action="start" class="panel-btn panel-btn--action panel-btn--start">
              ▶️ Start Crawl
            </button>
            <button data-multimodal-action="pause" class="panel-btn panel-btn--action panel-btn--pause" disabled>
              ⏸️ Pause
            </button>
            <button data-multimodal-action="stop" class="panel-btn panel-btn--action panel-btn--stop" disabled>
              ⏹️ Stop
            </button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-section__title">📊 Phase Progress</h3>
        <div class="panel-card">
          <div class="panel-progress-header">
            <span data-multimodal-stat="phase-label">Idle</span>
            <span data-multimodal-stat="progress-text">–</span>
          </div>
          <div class="panel-progress-track">
            <div data-multimodal-progress-bar class="panel-progress-bar panel-progress-bar--rainbow"></div>
          </div>
          <div class="panel-phase-icons">
            <span data-multimodal-phase-icon="downloading" class="panel-phase-icon">📥 Download</span>
            <span data-multimodal-phase-icon="analyzing" class="panel-phase-icon">🔍 Analyze</span>
            <span data-multimodal-phase-icon="learning" class="panel-phase-icon">🧠 Learn</span>
            <span data-multimodal-phase-icon="discovering" class="panel-phase-icon">🔭 Discover</span>
            <span data-multimodal-phase-icon="reanalyzing" class="panel-phase-icon">♻️ Re-analyze</span>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-section__title">🧠 Learning Insights</h3>
        <div data-multimodal-insights class="panel-log">
          <div class="panel-log__empty">No insights yet. Start a crawl to begin learning.</div>
        </div>
      </div>

      <div class="panel-status" data-multimodal-status>
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
      ${renderPanelHero({
    title: '📥 Download Statistics',
    description: 'Evidence-based download verification. All counts are queried directly from the database.'
  })}

      ${renderStatsRow([
    { value: '–', label: 'Total Downloads', valueAttrs: { 'data-downloads-stat': 'total' } },
    { value: '–', label: 'Verified (HTTP 200)', valueAttrs: { 'data-downloads-stat': 'verified' } },
    { value: '–', label: 'Total Size', valueAttrs: { 'data-downloads-stat': 'bytes' } }
  ])}

      <div class="panel-section">
        <h3 class="panel-section__title">📊 50-Page Crawl Progress</h3>
        <div class="panel-card">
          <div class="panel-progress-header">
            <span>Progress</span>
            <span data-downloads-stat="progress-text">0 / 50</span>
          </div>
          <div class="panel-progress-track panel-progress-track--tall">
            <div data-downloads-progress-bar class="panel-progress-bar panel-progress-bar--green"></div>
          </div>
          <div class="panel-btn-row mt-12">
            <button data-downloads-action="start-crawl" class="panel-btn panel-btn--action panel-btn--start">
              🕷️ Start 50-Page Crawl
            </button>
            <button data-downloads-action="refresh" class="panel-btn panel-btn--default">
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-section__title">📝 Recent Downloads</h3>
        <div data-downloads-recent class="panel-log panel-log--tall">
          Loading...
        </div>
      </div>

      <div class="panel-status" data-downloads-status>
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

function renderSearchExplorerPanel() {
  const context = new jsgui.Page_Context();
  const control = new SearchExplorerControl({
    context,
    apiBase: '/api/search-explorer'
  });
  const html = control.renderHtml();

  const activationKey = 'search-explorer';
  return {
    content: wrapPanelHtml({
      appId: 'search-explorer',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

function renderDownloadVerificationPanel() {
  const context = new jsgui.Page_Context();
  const control = new DownloadVerificationPanelControl({
    context,
    apiBase: '/api/downloads/verifications'
  });
  const html = control.renderHtml();

  const activationKey = 'download-verification';
  return {
    content: wrapPanelHtml({
      appId: 'download-verification',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

function renderCloudCrawlPanel() {
  const context = new jsgui.Page_Context();
  const control = new CloudCrawlPanelControl({
    context,
    apiBase: '/api/cloud-crawl'
  });
  const html = control.renderHtml();

  const activationKey = 'cloud-crawl';
  return {
    content: wrapPanelHtml({
      appId: 'cloud-crawl',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

function renderScreenshotReviewPanel() {
  const context = new jsgui.Page_Context();
  const control = new ScreenshotReviewPanelControl({
    context,
    apiBase: '/api/screenshot-review'
  });
  const html = control.renderHtml();

  const activationKey = 'screenshot-review';
  return {
    content: wrapPanelHtml({
      appId: 'screenshot-review',
      activationKey,
      html
    }),
    embed: 'panel',
    activationKey
  };
}

/**
 * Create the sub-app registry
 * @param {Object} options Options including getDbRW
 * @returns {Array} Array of sub-app definitions
 */
function createSubAppRegistry(options = {}) {
  const getDb = () => {
    if (options.getDbRW) {
      const rw = options.getDbRW();
      if (rw && rw.db) return rw.db;
    }
    return null;
  };

  const apps = [
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
        let totalArticles = '–';
        let knownHubs = '–';
        let domains = '–';
        let recentRuns = [];

        try {
          const db = getDb();
          if (db) {
            const counts = getUnifiedAppHomeDashboardCounts(db);
            totalArticles = counts.totalArticles ?? totalArticles;
            knownHubs = counts.knownHubs ?? knownHubs;
            domains = counts.domains ?? domains;

            recentRuns = db.taskEvents.listRecentCrawlTaskRuns({ limit: 5 });

            // Format recent runs
            for (let i = 0; i < recentRuns.length; i++) {
              const r = recentRuns[i];
              const startEvent = db.taskEvents.getFirstTaskEventPayload(r.task_id, ['crawl:start', 'crawl:started']);
              let targetHost = 'Unknown';
              if (startEvent && startEvent.payload) {
                try {
                  const config = JSON.parse(startEvent.payload);
                  targetHost = config.startUrl || config.domain || r.task_id;
                } catch (e) { targetHost = r.task_id; }
              }
              r.targetHost = targetHost;

              const endEventType = db.taskEvents.getLatestTaskEventType(r.task_id);
              r.status = endEventType ? (endEventType === 'crawl:error' ? 'Failed' : (endEventType === 'crawl:complete' ? 'Complete' : 'Active')) : 'Unknown';

              // Simple duration calculation
              const startMs = new Date(r.started_at).getTime();
              const endMs = new Date(r.finished_at).getTime();
              const durSec = Math.round((endMs - startMs) / 1000);
              r.duration = durSec > 60 ? Math.round(durSec / 60) + 'm ' + (durSec % 60) + 's' : durSec + 's';
            }
          }
        } catch (e) {
          console.error("Home dashdb error:", e);
        }

        let activityRows = recentRuns.map(r => `
          <tr style="border-bottom: 1px solid rgba(139, 105, 20, 0.2);">
            <td style="padding: 12px 16px; color: var(--gold); font-family: monospace;">${r.targetHost.replace(/^https?:\/\/(www\.)?/, '')}</td>
            <td style="padding: 12px 16px; text-align: center;">${r.duration}</td>
            <td style="padding: 12px 16px; text-align: right; color: ${r.status === 'Active' ? '#4ade80' : r.status === 'Failed' ? '#f87171' : 'var(--text-cream)'};">${r.status}</td>
          </tr>
        `).join('');

        if (!activityRows) {
          activityRows = `<tr><td colspan="3" style="padding: 24px; text-align: center; color: var(--text-muted);">No recent crawls found.</td></tr>`;
        }

        return renderHomePanel(`
          <div class="home-dashboard">
            ${renderPanelHero({
          title: '🎛️ Unified Control Center',
          description: 'Real-time overview of the Copilot Crawler ecosystem.'
        })}
            
            ${renderStatsRow([
          { value: totalArticles.toLocaleString(), label: 'Articles Indexed' },
          { value: knownHubs.toLocaleString(), label: 'Known Hub Pages' },
          { value: domains.toLocaleString(), label: 'Tracked Domains' }
        ])}

            <div class="home-crawl-overview-grid">
              <div>
                ${renderStatsRow([
          { value: '...', label: 'Active Crawls', valueAttrs: { 'data-home-stat': 'activeCrawlJobs' } },
          { value: '...', label: 'Recent Errors (10m)', valueAttrs: { 'data-home-stat': 'errorsLast10m' } }
        ])}
              </div>
              <div class="panel-card" style="padding: 0; overflow: hidden;">
                <h3 style="padding: 16px; border-bottom: 1px solid var(--border-gold); margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">Recent Crawl Activity</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
                  <thead>
                    <tr style="background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border-gold);">
                      <th style="padding: 12px 16px; font-weight: normal; color: var(--text-muted);">Target</th>
                      <th style="padding: 12px 16px; font-weight: normal; color: var(--text-muted); text-align: center;">Duration</th>
                      <th style="padding: 12px 16px; font-weight: normal; color: var(--text-muted); text-align: right;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${activityRows}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="home-alert" data-home-crawl-alert style="display:none;">
              <strong class="mr-8">Last crawl error</strong>
              <span data-home-crawl-error-message class="mono">–</span>
              <a href="/?app=crawl-status" class="alert-link">Open Crawl Status</a>
            </div>
          </div>
        `);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // Crawler Operations
    // ─────────────────────────────────────────────────────────────
    {
      id: 'cloud-crawl',
      label: 'Cloud Crawl',
      icon: '☁️',
      category: 'crawler',
      description: 'Compact five-site remote crawl view with screenshot-ready evidence',
      renderContent: async () => {
        return renderCloudCrawlPanel();
      }
    },

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
      id: 'domain-registry',
      label: 'Domain Registry',
      icon: '🗂️',
      category: 'crawler',
      description: 'Manage crawl domains and sync enabled hosts into scheduler',
      renderContent: async () => {
        return renderIframeApp('/domain-registry', 'Domain Registry');
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
      id: 'download-verification',
      label: 'Download Verify',
      icon: '✅',
      category: 'analytics',
      description: 'Recent download persistence and compression verification',
      renderContent: async () => {
        return renderDownloadVerificationPanel();
      }
    },

    {
      id: 'search-explorer',
      label: 'Search Explorer',
      icon: '🔎',
      category: 'analytics',
      description: 'Search articles with query, author, domain, category, and date filters',
      renderContent: async () => {
        return renderSearchExplorerPanel();
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
      id: 'place-hubs-table',
      label: 'Place Hubs',
      icon: '📍',
      category: 'analytics',
      description: 'Browse place hub URLs — filter by host and kind, search by place',
      renderContent: async () => {
        return renderIframeApp('/place-hubs-table', 'Place Hubs');
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
      id: 'screenshot-review',
      label: 'Screenshots',
      icon: '🖼️',
      category: 'dev',
      description: 'Review saved UI screenshots and write comments for agents',
      renderContent: async () => {
        return renderScreenshotReviewPanel();
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

  return apps;
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
