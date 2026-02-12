'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const { createTwoColumnLayoutControls } = require('../../../controls/layouts/TwoColumnLayoutFactory');
const { CATEGORIES } = require('../subApps/registry');
const {
  buildHomeActivator,
  buildPanelDemoActivator,
  buildMultiModalCrawlActivator,
  buildDownloadsActivator,
  buildPlaceholderActivator,
  buildSubAppDelegateActivator,
} = require('../activators');

// Get layout controls
const { TwoColumnLayout, buildStyles } = createTwoColumnLayoutControls(jsgui);

/**
 * UnifiedShell - Main application shell with sidebar navigation
 * 
 * Uses off-screen DOM preservation pattern:
 * - All loaded sub-apps are kept in DOM with visibility: hidden
 * - Switching apps just toggles visibility (no re-render)
 * - State is preserved across app switches
 */
class UnifiedShell extends Control {
  constructor(spec = {}) {
    super(spec);
    this.subApps = spec.subApps || [];
    this.activeAppId = spec.activeAppId || 'home';
  }

  render() {
    const layoutStyles = buildStyles({ sidebarWidth: 260, theme: 'dark' });
    const shellStyles = this._buildShellStyles();
    const clientScript = this._buildClientScript();
    
    // Group apps by category
    const groupedApps = this._groupByCategory();
    
    // Build navigation HTML
    const navHtml = this._buildNavigation(groupedApps);
    
    // Build app containers (all rendered, only active visible)
    const appContainersHtml = this._buildAppContainers();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unified App Shell</title>
  <style>
    ${layoutStyles}
    ${shellStyles}
  </style>
</head>
<body>
  <div class="unified-shell">
    <aside class="shell-sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">🎛️</span>
        <span class="brand-title">Control Center</span>
      </div>
      ${navHtml}
    </aside>
    
    <main class="shell-content">
      <div class="app-viewport" id="appViewport">
        ${appContainersHtml}
      </div>
    </main>
  </div>
  
  <script>
    ${clientScript}
  </script>
</body>
</html>`;
  }

  _groupByCategory() {
    const groups = {};
    for (const app of this.subApps) {
      const cat = app.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(app);
    }
    return groups;
  }

  _buildNavigation(groupedApps) {
    const categoryOrder = ['main', 'crawler', 'admin', 'analytics', 'dev'];
    let html = '<nav class="shell-nav">';
    
    for (const catId of categoryOrder) {
      const apps = groupedApps[catId];
      if (!apps || apps.length === 0) continue;
      
      const catMeta = CATEGORIES[catId] || { label: catId, icon: '📁' };
      
      // Category header (except for 'main')
      if (catId !== 'main') {
        html += `<div class="nav-category">${catMeta.icon} ${catMeta.label}</div>`;
      }
      
      // Nav items
      for (const app of apps) {
        const isActive = app.id === this.activeAppId;
        const activeClass = isActive ? ' nav-item--active' : '';
        html += `
          <button class="nav-item${activeClass}" 
                  data-app-id="${app.id}"
                  data-app-category="${catId}"
                  title="${app.description}">
            <span class="nav-item__icon">${app.icon}</span>
            <span class="nav-item__label">${app.label}</span>
            <span class="nav-item__badge" data-nav-badge aria-hidden="true"></span>
          </button>
        `;
      }
    }
    
    html += '</nav>';
    return html;
  }

  _buildAppContainers() {
    let html = '';
    
    for (const app of this.subApps) {
      const isActive = app.id === this.activeAppId;
      const visibilityClass = isActive ? '' : ' app-container--hidden';
      // Note: We do NOT pre-render sub-app HTML server-side.
      // The active container starts with a loading placeholder and must be fetched client-side.
      const loadedAttr = '';
      
      html += `
        <div class="app-container${visibilityClass}" 
             id="app-${app.id}" 
             data-app-id="${app.id}"${loadedAttr}>
          ${isActive ? '<div class="app-loading">Loading...</div>' : ''}
        </div>
      `;
    }
    
    return html;
  }

  _buildShellStyles() {
    return `
      /* ═══════════════════════════════════════════════════════════════════════
         WLILO Theme - Unified Shell
         ═══════════════════════════════════════════════════════════════════════ */
      
      :root {
        --bg-obsidian: #1a1410;
        --bg-leather: #2a1f17;
        --bg-leather-light: #3d2b1f;
        --gold: #d4a574;
        --gold-light: #e8c9a0;
        --gold-dark: #a67c4e;
        --border-gold: #8b6914;
        --text-cream: #f5e6d3;
        --text-muted: #b8a090;
        --success: #4ade80;
        --error: #f87171;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        font-family: 'Segoe UI', system-ui, sans-serif;
        background: var(--bg-obsidian);
        color: var(--text-cream);
        min-height: 100vh;
        overflow: hidden;
      }

      /* Shell Layout */
      .unified-shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }

      /* Sidebar */
      .shell-sidebar {
        width: 260px;
        min-width: 260px;
        background: linear-gradient(180deg, var(--bg-leather) 0%, var(--bg-obsidian) 100%);
        border-right: 1px solid var(--border-gold);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .sidebar-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px;
        border-bottom: 1px solid var(--border-gold);
        background: linear-gradient(135deg, rgba(212, 165, 116, 0.1) 0%, transparent 100%);
      }

      .brand-icon {
        font-size: 28px;
      }

      .brand-title {
        font-family: Georgia, serif;
        font-size: 18px;
        font-weight: 600;
        color: var(--gold);
        letter-spacing: 0.5px;
      }

      /* Navigation */
      .shell-nav {
        flex: 1;
        overflow-y: auto;
        padding: 12px 0;
      }

      .nav-category {
        padding: 16px 20px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-muted);
        border-top: 1px solid rgba(139, 105, 20, 0.2);
        margin-top: 8px;
      }

      .nav-category:first-child {
        border-top: none;
        margin-top: 0;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 20px;
        background: none;
        border: none;
        border-left: 3px solid transparent;
        color: var(--text-cream);
        font-size: 14px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
      }

      .nav-item:hover {
        background: rgba(212, 165, 116, 0.08);
        border-left-color: var(--gold-dark);
      }

      .nav-item--active {
        background: rgba(212, 165, 116, 0.15);
        border-left-color: var(--gold);
      }

      .nav-item--active .nav-item__label {
        color: var(--gold);
        font-weight: 600;
      }

      .nav-item__icon {
        font-size: 18px;
        width: 24px;
        text-align: center;
      }

      .nav-item__label {
        flex: 1;
      }

      .nav-item__badge {
        display: none;
        min-width: 18px;
        height: 18px;
        padding: 0 6px;
        border-radius: 999px;
        border: 1px solid rgba(248, 113, 113, 0.55);
        background: rgba(248, 113, 113, 0.12);
        color: #ffd0d0;
        font-size: 12px;
        line-height: 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        align-items: center;
        justify-content: center;
      }

      .nav-item--has-alert .nav-item__badge {
        display: inline-flex;
      }

      /* Main Content */
      .shell-content {
        flex: 1;
        overflow: hidden;
        background: var(--bg-obsidian);
      }

      .app-viewport {
        height: 100%;
        overflow: hidden;
        position: relative;
      }

      /* App Containers - Off-screen preservation */
      .app-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: auto;
        background: var(--bg-obsidian);
        transition: opacity 0.15s ease;
      }

      .app-container--hidden {
        visibility: hidden;
        pointer-events: none;
        opacity: 0;
        /* Keep in DOM but move off-screen for performance */
        transform: translateX(-100%);
      }

      .app-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-size: 18px;
        color: var(--text-muted);
      }

      /* Embedded apps (iframe mode) */
      .app-embed {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: transparent;
      }

      /* Sub-app styling overrides */
      .app-container .dashboard-header {
        border-top: none;
      }

      .app-container .hub-nav {
        display: none; /* Hide hub nav in unified shell */
      }

      /* Placeholder for unimplemented apps */
      .app-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        color: var(--text-muted);
      }

      /* Panel contract root (non-iframe sub-apps) */
      .unified-panel-root {
        height: 100%;
      }

      .app-placeholder p {
        font-size: 24px;
        margin-bottom: 12px;
      }

      .app-placeholder .error {
        font-size: 14px;
        color: var(--error);
        font-family: monospace;
      }

      /* Home Dashboard */
      .home-dashboard {
        padding: 40px;
        max-width: 1200px;
        margin: 0 auto;
      }

      .home-hero {
        text-align: center;
        padding: 60px 20px;
        background: linear-gradient(135deg, var(--bg-leather) 0%, var(--bg-obsidian) 100%);
        border-radius: 12px;
        border: 1px solid var(--border-gold);
        margin-bottom: 40px;
      }

      .home-hero h1 {
        font-family: Georgia, serif;
        font-size: 36px;
        color: var(--gold);
        margin-bottom: 16px;
      }

      .home-hero p {
        font-size: 18px;
        color: var(--text-muted);
        max-width: 600px;
        margin: 0 auto;
      }

      .home-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
      }

      .stat-card {
        background: var(--bg-leather);
        border: 1px solid var(--border-gold);
        border-radius: 8px;
        padding: 24px;
        text-align: center;
      }

      .stat-value {
        display: block;
        font-size: 48px;
        font-weight: 700;
        color: var(--gold);
        margin-bottom: 8px;
      }

      .stat-label {
        font-size: 14px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ═══════════════════════════════════════════════════════════════
         Panel component classes (replace inline styles)
         ═══════════════════════════════════════════════════════════════ */

      /* Panel sections */
      .panel-section {
        margin-top: 32px;
      }

      .panel-section__title {
        color: var(--gold);
        margin-bottom: 16px;
        font-size: 18px;
      }

      .panel-card {
        background: var(--bg-leather);
        border: 1px solid var(--border-gold);
        border-radius: 8px;
        padding: 20px;
      }

      /* Form grid layout */
      .panel-form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }

      .panel-label {
        display: block;
        margin-bottom: 6px;
        color: var(--text-muted);
        font-size: 12px;
      }

      .panel-input,
      .panel-select {
        width: 100%;
        padding: 10px;
        border-radius: 6px;
        border: 1px solid var(--border-gold);
        background: rgba(0, 0, 0, 0.3);
        color: var(--text-cream);
        font-family: inherit;
      }

      /* Button row */
      .panel-btn-row {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 16px;
      }

      /* Base button */
      .panel-btn {
        padding: 10px 14px;
        border-radius: 8px;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: opacity 0.15s ease;
      }

      .panel-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Button variants */
      .panel-btn--action {
        padding: 12px 24px;
        font-weight: 600;
      }

      .panel-btn--start {
        border: 1px solid #22c55e;
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }

      .panel-btn--pause {
        border: 1px solid #f59e0b;
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .panel-btn--stop {
        border: 1px solid #ef4444;
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .panel-btn--default {
        border: 1px solid var(--border-gold);
        background: rgba(212, 165, 116, 0.12);
        color: var(--text-cream);
      }

      .panel-btn--ghost {
        border: 1px solid var(--border-gold);
        background: rgba(212, 165, 116, 0.06);
        color: var(--text-cream);
      }

      /* Progress bar */
      .panel-progress-track {
        height: 20px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 10px;
        overflow: hidden;
        position: relative;
      }

      .panel-progress-track--tall {
        height: 24px;
        border-radius: 12px;
      }

      .panel-progress-bar {
        height: 100%;
        width: 0%;
        border-radius: inherit;
        transition: width 0.3s ease-out;
      }

      .panel-progress-bar--rainbow {
        background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%);
      }

      .panel-progress-bar--green {
        background: linear-gradient(90deg, #22c55e 0%, #4ade80 100%);
      }

      .panel-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      /* Phase icons row */
      .panel-phase-icons {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        font-size: 11px;
        color: var(--text-muted);
      }

      .panel-phase-icon {
        opacity: 0.4;
      }

      /* Log / insights area */
      .panel-log {
        background: var(--bg-leather);
        border: 1px solid var(--border-gold);
        border-radius: 8px;
        padding: 16px;
        max-height: 200px;
        overflow-y: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        color: var(--text-muted);
      }

      .panel-log--tall {
        max-height: 300px;
      }

      /* Status line */
      .panel-status {
        margin-top: 18px;
        text-align: center;
        color: var(--text-muted);
        font-size: 12px;
      }

      /* Mono text helper */
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }

      /* Alert banner */
      .home-alert {
        margin-top: 14px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 122, 122, 0.55);
        background: rgba(255, 122, 122, 0.10);
        color: #ffd0d0;
      }

      /* ═══════════════════════════════════════════════════════════════
         Theme color utilities (use instead of inline style="color:…")
         ═══════════════════════════════════════════════════════════════ */
      .text-success  { color: var(--success); }
      .text-error    { color: var(--error); }
      .text-muted    { color: var(--text-muted); }
      .text-gold     { color: var(--gold); }
      .text-cream    { color: var(--text-cream); }

      /* Insight row in panel-log */
      .insight-row       { margin-bottom: 4px; }
      .insight-row--info { color: var(--text-muted); }

      /* Empty-state placeholder in log areas */
      .panel-log__empty  { color: var(--text-muted); }

      /* Layout utilities */
      .mt-24  { margin-top: 24px; }
      .mt-12  { margin-top: 12px; }
      .mr-8   { margin-right: 8px; }
      .ml-10  { margin-left: 10px; }

      /* Alert link */
      .alert-link {
        color: #ffd0d0;
        text-decoration: underline;
        margin-left: 10px;
      }

      /* Scrollbar styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: var(--bg-obsidian);
      }

      ::-webkit-scrollbar-thumb {
        background: var(--border-gold);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: var(--gold-dark);
      }
    `;
  }

  _buildClientScript() {
    return `
      (function() {
        'use strict';
        
        const appViewport = document.getElementById('appViewport');
        const navItems = document.querySelectorAll('.nav-item');
        let currentAppId = '${this.activeAppId}';

        // ─── Shared utilities ────────────────────────────────────────
        function escapeHtml(str) {
          return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        }

        function setText(el, text) {
          if (el) el.textContent = text;
        }

        const crawlNavItems = document.querySelectorAll('.nav-item[data-app-category="crawler"]');

        async function fetchCrawlSummary() {
          const res = await fetch('/api/crawl/summary', { cache: 'no-store' });
          const json = await res.json();
          if (!res.ok || !json || json.status !== 'ok') {
            throw new Error((json && json.error) ? json.error : 'bad response');
          }
          return json;
        }

        function setNavBadgeOnItem(item, { show, text }) {
          if (!item) return;
          const badge = item.querySelector('[data-nav-badge]');
          item.classList.toggle('nav-item--has-alert', show);

          if (badge) {
            badge.textContent = text || '!';
            badge.setAttribute('aria-hidden', show ? 'false' : 'true');
          }
        }

        function updateCrawlNavBadges(summary) {
          const lastError = summary && typeof summary.lastError === 'object' ? summary.lastError : null;
          const hasError = Boolean(lastError && lastError.message);
          const errorsLast10m = Number.isFinite(summary && summary.errorsLast10m) ? summary.errorsLast10m : 0;

          let badgeText = '!';
          if (errorsLast10m > 0) {
            badgeText = errorsLast10m > 99 ? '99+' : String(errorsLast10m);
          }

          for (const item of crawlNavItems) {
            setNavBadgeOnItem(item, { show: hasError, text: badgeText });
          }
        }

        function bindCrawlNavBadgePoll() {
          if (document.body.dataset.crawlNavBadgePollBound === 'true') return;
          document.body.dataset.crawlNavBadgePollBound = 'true';

          async function refresh() {
            try {
              const summary = await fetchCrawlSummary();
              updateCrawlNavBadges(summary);
              document.body.dataset.crawlNavBadgeOk = 'true';
            } catch {
              // Leave the current badge state; no-op.
              document.body.dataset.crawlNavBadgeOk = 'false';
            }
          }

          refresh();
          setInterval(refresh, 5000);
        }

        // ─────────────────────────────────────────────────────────────
        // Panel activation seam
        // ─────────────────────────────────────────────────────────────

        function getPanelActivatorRegistry() {
          if (!window.UnifiedAppPanels) window.UnifiedAppPanels = {};

          if (!window.UnifiedAppPanels.activators) {
            window.UnifiedAppPanels.activators = Object.create(null);
          }

          if (typeof window.UnifiedAppPanels.registerActivator !== 'function') {
            window.UnifiedAppPanels.registerActivator = function(key, fn) {
              if (!key) return;
              if (typeof fn !== 'function') return;
              window.UnifiedAppPanels.activators[String(key)] = fn;
            };
          }

          return window.UnifiedAppPanels.activators;
        }

        function activatePanelIfPresent(container, appId, activationKey) {
          if (!container) return;
          if (container.dataset.activated === 'true') return;

          const root = container.querySelector('[data-unified-activate]');
          const key = activationKey || (root ? root.dataset.unifiedActivate : null);
          if (!key) {
            // No activation requested.
            container.dataset.activated = 'true';
            return;
          }

          const registry = getPanelActivatorRegistry();
          const activator = registry && registry[key];

          if (typeof activator === 'function') {
            try {
              activator(root || container, { appId, container });
            } catch (err) {
              console.warn('[UnifiedApp] panel activation failed:', appId, key, err && err.message ? err.message : err);
            }
          }

          container.dataset.activated = 'true';
        }

        // ─── Panel activators (composed from modules) ────────────
        (function seedDefaultActivators() {
          const registry = getPanelActivatorRegistry();
          ${buildPlaceholderActivator()}
          ${buildHomeActivator()}
          ${buildPanelDemoActivator()}

          ${buildMultiModalCrawlActivator()}
          ${buildDownloadsActivator()}
        })();

        // ─── Sub-app delegated event handlers ──────────────────
        ${buildSubAppDelegateActivator()}
        
        // Load app content from server
        async function loadAppContent(appId) {
          const container = document.getElementById('app-' + appId);
          if (!container) return;
          
          // Already loaded?
          if (container.dataset.loaded === 'true') return;

          // Content is changing; allow activation to run again after load.
          container.dataset.activated = 'false';
          
          container.innerHTML = '<div class="app-loading">Loading...</div>';
          
          try {
            const response = await fetch('/api/apps/' + appId + '/content');
            const data = await response.json();
            
            if (data.error) {
              container.innerHTML = '<div class="app-placeholder"><p>Error</p><p class="error">' + escapeHtml(data.error) + '</p></div>';
            } else {
              container.innerHTML = data.content;
              container.dataset.loaded = 'true';

              const activationKey = typeof data.activationKey === 'string' ? data.activationKey : '';
              const embed = typeof data.embed === 'string' ? data.embed : '';
              container.dataset.activationKey = activationKey;
              container.dataset.embed = embed;

              activatePanelIfPresent(container, appId, activationKey);
            }
          } catch (err) {
            container.innerHTML = '<div class="app-placeholder"><p>Error</p><p class="error">' + escapeHtml(err.message) + '</p></div>';
          }
        }
        
        // Switch to app
        function switchToApp(appId) {
          if (appId === currentAppId) return;
          
          // Hide current app (off-screen preservation)
          const currentContainer = document.getElementById('app-' + currentAppId);
          if (currentContainer) {
            currentContainer.classList.add('app-container--hidden');
            // Pause polling timers for the panel being hidden
            if (typeof currentContainer._downloadsCleanup === 'function') {
              currentContainer._downloadsCleanup();
              currentContainer.dataset.downloadsBound = 'false'; // Allow re-bind on next show
            }
          }
          
          // Update nav
          navItems.forEach(item => {
            item.classList.toggle('nav-item--active', item.dataset.appId === appId);
          });
          
          // Show target app
          const targetContainer = document.getElementById('app-' + appId);
          if (targetContainer) {
            targetContainer.classList.remove('app-container--hidden');
            
            // Load if needed
            if (targetContainer.dataset.loaded !== 'true') {
              loadAppContent(appId);
            } else {
              // For panel-mode sub-apps, activation is idempotent and safe.
              activatePanelIfPresent(targetContainer, appId, targetContainer.dataset.activationKey);
            }
          }
          
          currentAppId = appId;
          
          // Update URL without reload
          history.pushState({ app: appId }, '', '?app=' + appId);
        }
        
        // Bind nav clicks
        navItems.forEach(item => {
          item.addEventListener('click', () => {
            const appId = item.dataset.appId;
            if (appId) switchToApp(appId);
          });
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', (event) => {
          if (event.state && event.state.app) {
            switchToApp(event.state.app);
          }
        });
        
        // Load initial app content
        loadAppContent(currentAppId);

        // Crawl badges should update even if Home is never opened.
        bindCrawlNavBadgePoll();
        
        console.log('🎛️ Unified App Shell initialized');
        
        
      })();
    `;
  }
}

module.exports = { UnifiedShell };
