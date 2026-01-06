'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const { createTwoColumnLayoutControls } = require('../../../controls/layouts/TwoColumnLayoutFactory');
const { CATEGORIES } = require('../subApps/registry');

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

        // Seed a couple of safe, no-UI-change activators as examples.
        // Panels can register additional activators via window.UnifiedAppPanels.registerActivator(...).
        (function seedDefaultActivators() {
          const registry = getPanelActivatorRegistry();

          if (typeof registry.placeholder !== 'function') {
            registry.placeholder = function(root) {
              root.dataset.panelActivated = 'true';
            };
          }

          if (typeof registry.home !== 'function') {
            registry.home = function(root) {
              if (!root) return;

              const elJobs = root.querySelector('[data-home-stat="activeCrawlJobs"]');
              const elHealth = root.querySelector('[data-home-stat="crawlHealth"]');
              const elAlert = root.querySelector('[data-home-crawl-alert]');
              const elErrorMsg = root.querySelector('[data-home-crawl-error-message]');

              function setAlertVisible(visible) {
                if (!elAlert) return;
                elAlert.style.display = visible ? 'block' : 'none';
              }

              function setText(el, text) {
                if (!el) return;
                el.textContent = text;
              }

              async function refresh() {
                try {
                  const json = await fetchCrawlSummary();

                  const activeJobs = Number.isFinite(json.activeJobs) ? json.activeJobs : 0;
                  setText(elJobs, String(activeJobs));

                  const lastError = json.lastError && typeof json.lastError === 'object' ? json.lastError : null;
                  const hasError = Boolean(lastError && lastError.message);
                  setText(elHealth, hasError ? 'ERR' : 'OK');

                  if (elErrorMsg) {
                    const errorsLast10m = Number.isFinite(json.errorsLast10m) ? json.errorsLast10m : null;
                    const parts = [];
                    if (hasError && lastError && lastError.message) parts.push(String(lastError.message).trim());
                    if (hasError && lastError && lastError.jobId) parts.push('job: ' + String(lastError.jobId).trim());
                    if (hasError && lastError && lastError.url) parts.push(String(lastError.url).trim());
                    if (hasError && errorsLast10m != null) parts.push(String(errorsLast10m) + '/10m');
                    const msg = hasError ? parts.filter(Boolean).join(' | ').slice(0, 160) : '–';
                    setText(elErrorMsg, msg);
                  }

                  setAlertVisible(hasError);
                  root.dataset.homeCrawlSummaryOk = 'true';
                } catch (err) {
                  setText(elJobs, '–');
                  setText(elHealth, '?');
                  if (elErrorMsg) setText(elErrorMsg, (err && err.message ? err.message : String(err)).slice(0, 120));
                  setAlertVisible(true);
                  root.dataset.homeCrawlSummaryOk = 'false';
                }
              }

              if (root.dataset.homeCrawlPollBound !== 'true') {
                root.dataset.homeCrawlPollBound = 'true';
                refresh();
                setInterval(refresh, 5000);
              } else {
                refresh();
              }

              root.dataset.panelActivated = 'true';
            };
          }

          if (typeof registry['panel-demo'] !== 'function') {
            registry['panel-demo'] = function(root) {
              if (root.dataset.demoBound === 'true') return;
              root.dataset.demoBound = 'true';

              let clicks = 0;
              const output = root.querySelector('[data-panel-demo-output]');
              const statCards = root.querySelectorAll('.stat-card .stat-value');

              function render() {
                const now = new Date();
                const lastPing = root.dataset.lastPing || '–';

                if (output) {
                  output.textContent = 'Activated ✓ | Clicks: ' + clicks + ' | Last Ping: ' + lastPing;
                }

                // Update the three stat cards if present: Activation, Clicks, Last Ping
                if (statCards && statCards.length >= 3) {
                  statCards[0].textContent = '✓';
                  statCards[1].textContent = String(clicks);
                  statCards[2].textContent = lastPing;
                }

                root.dataset.lastRenderAt = now.toISOString();
              }

              root.addEventListener('click', (event) => {
                const btn = event && event.target ? event.target.closest('[data-panel-demo-action]') : null;
                if (!btn) return;

                const action = btn.getAttribute('data-panel-demo-action');
                if (action === 'ping') {
                  clicks += 1;
                  root.dataset.lastPing = new Date().toISOString().slice(11, 19);
                  render();
                  return;
                }

                if (action === 'reset') {
                  clicks = 0;
                  root.dataset.lastPing = '–';
                  render();
                }
              });

              render();
            };
          }

          // Multi-Modal Crawl panel activator
          if (typeof registry['multi-modal-crawl'] !== 'function') {
            registry['multi-modal-crawl'] = function(root) {
              if (root.dataset.multimodalBound === 'true') return;
              root.dataset.multimodalBound = 'true';

              // Element references
              const elPhase = root.querySelector('[data-multimodal-stat="phase"]');
              const elBatch = root.querySelector('[data-multimodal-stat="batch"]');
              const elPages = root.querySelector('[data-multimodal-stat="pages"]');
              const elPatterns = root.querySelector('[data-multimodal-stat="patterns"]');
              const elPhaseLabel = root.querySelector('[data-multimodal-stat="phase-label"]');
              const elProgressText = root.querySelector('[data-multimodal-stat="progress-text"]');
              const elProgressBar = root.querySelector('[data-multimodal-progress-bar]');
              const elInsights = root.querySelector('[data-multimodal-insights]');
              const elStatus = root.querySelector('[data-multimodal-status]');

              // Buttons
              const btnStart = root.querySelector('[data-multimodal-action="start"]');
              const btnPause = root.querySelector('[data-multimodal-action="pause"]');
              const btnStop = root.querySelector('[data-multimodal-action="stop"]');

              // Input getters
              function getInputValue(name) {
                const el = root.querySelector('[data-multimodal-input="' + name + '"]');
                return el ? el.value : null;
              }

              let eventSource = null;
              let isRunning = false;
              let insights = [];

              function setText(el, text) {
                if (el) el.textContent = text;
              }

              function setPhaseIcon(phase) {
                const icons = root.querySelectorAll('[data-multimodal-phase-icon]');
                icons.forEach(icon => {
                  const iconPhase = icon.dataset.multimodalPhaseIcon;
                  icon.style.opacity = iconPhase === phase ? '1' : '0.4';
                  icon.style.fontWeight = iconPhase === phase ? '600' : '400';
                });
              }

              function addInsight(text, type) {
                const now = new Date().toISOString().slice(11, 19);
                const color = type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#b8a090';
                insights.unshift({ time: now, text, color });
                if (insights.length > 50) insights.pop();
                renderInsights();
              }

              function renderInsights() {
                if (!elInsights) return;
                if (insights.length === 0) {
                  elInsights.innerHTML = '<div style="color: #666;">No insights yet. Start a crawl to begin learning.</div>';
                } else {
                  elInsights.innerHTML = insights.map(i =>
                    '<div style="color: ' + i.color + '; margin-bottom: 4px;">[' + i.time + '] ' + i.text + '</div>'
                  ).join('');
                }
              }

              function updateUI(data) {
                if (data.type === 'state' || data.type === 'progress') {
                  const v = data.value || data;
                  if (v.phase) {
                    setText(elPhase, v.phase);
                    setText(elPhaseLabel, v.phase);
                    setPhaseIcon(v.phase.toLowerCase());
                  }
                  if (v.batchNumber !== undefined) setText(elBatch, v.batchNumber);
                  if (v.pagesDownloaded !== undefined) setText(elPages, v.pagesDownloaded.toLocaleString());
                  if (v.patternsLearned !== undefined) setText(elPatterns, v.patternsLearned);
                  if (v.progress !== undefined && elProgressBar) {
                    const pct = Math.min(100, Math.round(v.progress * 100));
                    elProgressBar.style.width = pct + '%';
                    setText(elProgressText, pct + '%');
                  }
                }

                if (data.type === 'phase-change') {
                  const v = data.value || {};
                  const phase = v.phase || v.to || 'unknown';
                  const domainLabel = v.domain ? ' [' + v.domain + ']' : '';
                  addInsight('Phase: ' + phase + domainLabel + (v.batch ? ' (batch ' + v.batch + ')' : ''));
                  if (phase !== 'unknown') {
                    setPhaseIcon(phase.toLowerCase());
                  }
                }

                if (data.type === 'batch-complete') {
                  const v = data.value || {};
                  const domainLabel = v.domain ? ' [' + v.domain + ']' : '';
                  addInsight('Batch ' + v.batch + domainLabel + ' complete: ' + v.pagesDownloaded + ' pages', 'success');
                }

                if (data.type === 'pattern-learned') {
                  const v = data.value || {};
                  const domainLabel = v.domain ? ' [' + v.domain + ']' : '';
                  const learnedCount = v.patternsLearned ?? (v.significantPatterns ? v.significantPatterns.length : null);
                  const patternHint = v.pattern ? ' (' + String(v.pattern).slice(0, 8) + '...)' : '';
                  addInsight('Patterns learned' + domainLabel + (learnedCount != null ? ': ' + learnedCount : '') + patternHint, 'success');
                }

                if (data.type === 'hub-discovered') {
                  const v = data.value || {};
                  const domainLabel = v.domain ? ' [' + v.domain + ']' : '';
                  const url = v.url || v.newHubs?.[0]?.url || 'unknown';
                  const confidence = v.confidence ?? v.newHubs?.[0]?.confidence ?? 0;
                  addInsight('Hub discovered' + domainLabel + ': ' + url + ' (confidence: ' + Math.round(confidence * 100) + '%)', 'success');
                }

                if (data.type === 'analysis-progress') {
                  const v = data.value;
                  if (v.processed && v.total) {
                    setText(elProgressText, 'Analyzing: ' + v.processed + '/' + v.total);
                    if (elProgressBar) {
                      const pct = Math.round((v.processed / v.total) * 100);
                      elProgressBar.style.width = pct + '%';
                    }
                  }
                }

                if (data.type === 'error') {
                  addInsight('Error: ' + (data.error || 'unknown'), 'error');
                }

                if (data.type === 'complete') {
                  isRunning = false;
                  updateButtons();
                  addInsight('Crawl complete!', 'success');
                  setText(elPhase, 'Complete');
                  setText(elStatus, 'Status: Completed at ' + new Date().toISOString().slice(11, 19));
                }
              }

              function updateButtons() {
                if (btnStart) btnStart.disabled = isRunning;
                if (btnPause) btnPause.disabled = !isRunning;
                if (btnStop) btnStop.disabled = !isRunning;
              }

              function connectSSE() {
                if (eventSource) {
                  eventSource.close();
                }

                eventSource = new EventSource('/multi-modal/sse/multi-modal/progress');

                eventSource.onmessage = function(event) {
                  try {
                    const data = JSON.parse(event.data);
                    updateUI(data);
                  } catch (e) {
                    console.warn('[multi-modal] SSE parse error:', e);
                  }
                };

                eventSource.onerror = function() {
                  setText(elStatus, 'Status: Connection lost, reconnecting...');
                };

                eventSource.onopen = function() {
                  setText(elStatus, 'Status: Connected');
                };
              }

              async function startCrawl() {
                const domain = getInputValue('domain');
                if (!domain) {
                  alert('Please enter a domain');
                  return;
                }

                const body = {
                  domain,
                  batchSize: parseInt(getInputValue('batchSize'), 10) || 1000,
                  historicalRatio: (parseInt(getInputValue('historical'), 10) || 30) / 100,
                  maxTotalBatches: parseInt(getInputValue('maxBatches'), 10) || null,
                  hubDiscoveryPerBatch: getInputValue('hubDiscovery') === 'true',
                  balancingStrategy: getInputValue('strategy') || 'adaptive',
                  hubRefreshIntervalMs: (parseInt(getInputValue('hubRefreshInterval'), 10) || 60) * 60 * 1000,
                  pauseBetweenBatchesMs: (parseInt(getInputValue('pauseBetween'), 10) || 5) * 1000
                };

                try {
                  const res = await fetch('/multi-modal/api/multi-modal/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  const json = await res.json();

                  if (json.success) {
                    isRunning = true;
                    insights = [];
                    renderInsights();
                    addInsight('Started crawl on ' + domain);
                    setText(elStatus, 'Status: Running');
                    updateButtons();
                    connectSSE();
                  } else {
                    alert('Failed to start: ' + (json.error || 'unknown error'));
                  }
                } catch (err) {
                  alert('Failed to start: ' + err.message);
                }
              }

              async function pauseCrawl() {
                try {
                  await fetch('/multi-modal/api/multi-modal/pause', { method: 'POST' });
                  addInsight('Crawl paused');
                  setText(elStatus, 'Status: Paused');
                  if (btnPause) btnPause.textContent = '▶️ Resume';
                  if (btnPause) btnPause.dataset.multimodalAction = 'resume';
                } catch (err) {
                  alert('Failed to pause: ' + err.message);
                }
              }

              async function resumeCrawl() {
                try {
                  await fetch('/multi-modal/api/multi-modal/resume', { method: 'POST' });
                  addInsight('Crawl resumed');
                  setText(elStatus, 'Status: Running');
                  if (btnPause) btnPause.textContent = '⏸️ Pause';
                  if (btnPause) btnPause.dataset.multimodalAction = 'pause';
                } catch (err) {
                  alert('Failed to resume: ' + err.message);
                }
              }

              async function stopCrawl() {
                if (!confirm('Stop the current crawl?')) return;
                try {
                  await fetch('/multi-modal/api/multi-modal/stop', { method: 'POST' });
                  isRunning = false;
                  updateButtons();
                  addInsight('Crawl stopped');
                  setText(elStatus, 'Status: Stopped');
                  setText(elPhase, 'Stopped');
                } catch (err) {
                  alert('Failed to stop: ' + err.message);
                }
              }

              // Button handlers
              root.addEventListener('click', async (event) => {
                const btn = event.target.closest('[data-multimodal-action]');
                if (!btn) return;

                const action = btn.dataset.multimodalAction;
                if (action === 'start') await startCrawl();
                else if (action === 'pause') await pauseCrawl();
                else if (action === 'resume') await resumeCrawl();
                else if (action === 'stop') await stopCrawl();
              });

              // Check initial status
              async function checkStatus() {
                try {
                  const res = await fetch('/multi-modal/api/multi-modal/status');
                  const json = await res.json();
                  if (json.isRunning) {
                    isRunning = true;
                    updateButtons();
                    connectSSE();
                    if (json.statistics) {
                      updateUI({ type: 'state', value: json.statistics });
                    }
                  }
                } catch (err) {
                  // Ignore
                }
              }

              checkStatus();
              renderInsights();
            };
          }

          // Downloads panel activator
          if (typeof registry['downloads'] !== 'function') {
            registry['downloads'] = function(root) {
              if (root.dataset.downloadsBound === 'true') return;
              root.dataset.downloadsBound = 'true';

              const elTotal = root.querySelector('[data-downloads-stat="total"]');
              const elVerified = root.querySelector('[data-downloads-stat="verified"]');
              const elBytes = root.querySelector('[data-downloads-stat="bytes"]');
              const elProgressText = root.querySelector('[data-downloads-stat="progress-text"]');
              const elProgressBar = root.querySelector('[data-downloads-progress-bar]');
              const elRecent = root.querySelector('[data-downloads-recent]');
              const elStatus = root.querySelector('[data-downloads-status]');

              function formatBytes(bytes) {
                if (bytes < 1024) return bytes + ' B';
                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
              }

              function setText(el, text) {
                if (el) el.textContent = text;
              }

              async function fetchStats() {
                const res = await fetch('/api/downloads/stats');
                return res.json();
              }

              async function fetchRecent() {
                const now = new Date();
                const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                const params = new URLSearchParams({
                  start: oneHourAgo.toISOString(),
                  end: now.toISOString(),
                  limit: '10'
                });
                const res = await fetch('/api/downloads/evidence?' + params);
                return res.json();
              }

              async function fetchCrawlProgress() {
                const res = await fetch('/api/downloads/crawl-progress');
                return res.json();
              }

              // Track crawl state for adaptive polling
              let crawlActive = false;
              let progressPollTimer = null;
              let lastDownloaded = -1;

              // Fast progress polling (200ms) - only crawl progress, lightweight
              async function pollProgress() {
                try {
                  const crawlRes = await fetchCrawlProgress();
                  if (crawlRes.status === 'ok') {
                    if (crawlRes.active) {
                      crawlActive = true;
                      const p = crawlRes.progress;
                      
                      // Smooth animation: only update if changed
                      if (p.downloaded !== lastDownloaded) {
                        lastDownloaded = p.downloaded;
                        setText(elProgressText, p.downloaded + ' / ' + crawlRes.goal);
                        if (elProgressBar) {
                          elProgressBar.style.width = p.percentComplete + '%';
                        }
                      }
                    } else {
                      // Crawl finished or idle
                      if (crawlActive) {
                        // Just finished - do final update
                        crawlActive = false;
                        if (crawlRes.taskId) {
                          const p = crawlRes.progress;
                          setText(elProgressText, p.downloaded + ' / ' + crawlRes.goal + ' ✓');
                          if (elProgressBar) {
                            elProgressBar.style.width = p.percentComplete + '%';
                          }
                        }
                      } else if (crawlRes.taskId) {
                        // Show last completed crawl
                        const p = crawlRes.progress;
                        setText(elProgressText, p.downloaded + ' / ' + crawlRes.goal + ' ✓');
                        if (elProgressBar) {
                          elProgressBar.style.width = p.percentComplete + '%';
                        }
                      } else {
                        setText(elProgressText, '0 / 50');
                        if (elProgressBar) {
                          elProgressBar.style.width = '0%';
                        }
                      }
                    }
                  }
                } catch (err) {
                  // Silent fail on progress poll - stats refresh will show errors
                }
              }

              // Slower refresh for stats/recent (every 10s)
              async function refresh() {
                try {
                  const [statsRes, recentRes] = await Promise.all([fetchStats(), fetchRecent()]);
                  
                  if (statsRes.status === 'ok' && statsRes.stats) {
                    const s = statsRes.stats;
                    setText(elTotal, s.total_responses ? s.total_responses.toLocaleString() : '0');
                    setText(elVerified, s.verified_downloads ? s.verified_downloads.toLocaleString() : '0');
                    setText(elBytes, formatBytes(s.total_bytes || 0));
                  }

                  if (recentRes.status === 'ok' && recentRes.evidence) {
                    const lines = recentRes.evidence.map(e => 
                      e.fetched_at.slice(11, 19) + ' ' + e.http_status + ' ' + formatBytes(e.bytes_downloaded).padStart(10) + ' ' + (e.url || '').substring(0, 60) + '...'
                    );
                    if (elRecent) {
                      elRecent.innerHTML = lines.length > 0 
                        ? lines.map(l => '<div>' + l + '</div>').join('')
                        : '<div style="color: #666;">No downloads in last hour</div>';
                    }
                  }

                  setText(elStatus, 'Last updated: ' + new Date().toISOString().slice(11, 19));
                  root.dataset.downloadsOk = 'true';
                } catch (err) {
                  setText(elStatus, 'Error: ' + (err.message || String(err)));
                  root.dataset.downloadsOk = 'false';
                }
              }

              // Start fast progress polling (200ms)
              function startProgressPolling() {
                if (progressPollTimer) return;
                progressPollTimer = setInterval(pollProgress, 200);
              }

              // Button handlers
              root.addEventListener('click', async (event) => {
                const btn = event.target.closest('[data-downloads-action]');
                if (!btn) return;

                const action = btn.getAttribute('data-downloads-action');
                if (action === 'refresh') {
                  refresh();
                }
                if (action === 'start-crawl') {
                  btn.disabled = true;
                  btn.textContent = '⏳ Starting...';
                  try {
                    // TODO: Start actual crawl via API
                    alert('50-page crawl would start here. Use CLI for now:\\nnode tools/dev/verified-crawl.js https://www.theguardian.com --target 50');
                  } catch (err) {
                    alert('Failed: ' + err.message);
                  }
                  btn.disabled = false;
                  btn.textContent = '🕷️ Start 50-Page Crawl';
                }
              });

              // Initial load + polling
              refresh();                    // Stats/recent every 10s
              pollProgress();               // Progress immediately
              startProgressPolling();       // Progress every 200ms
              setInterval(refresh, 10000);  // Stats/recent every 10s
            };
          }
        })();
        
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
              container.innerHTML = '<div class="app-placeholder"><p>Error</p><p class="error">' + data.error + '</p></div>';
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
            container.innerHTML = '<div class="app-placeholder"><p>Error</p><p class="error">' + err.message + '</p></div>';
          }
        }
        
        // Switch to app
        function switchToApp(appId) {
          if (appId === currentAppId) return;
          
          // Hide current app (off-screen preservation)
          const currentContainer = document.getElementById('app-' + currentAppId);
          if (currentContainer) {
            currentContainer.classList.add('app-container--hidden');
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
        
        // ═══════════════════════════════════════════════════════════════════
        // Sub-App Client Handlers (global functions for onclick handlers)
        // ═══════════════════════════════════════════════════════════════════
        
        // Rate Limit Dashboard
        window.resetDomain = async function(domain) {
          if (!confirm('Reset rate limit tracking for ' + domain + '?')) return;
          try {
            const res = await fetch('/api/rate-limits/domains/' + encodeURIComponent(domain), { method: 'DELETE' });
            if (res.ok) location.reload();
            else alert('Failed to reset domain');
          } catch (e) { alert('Error: ' + e.message); }
        };
        
        // Webhook Dashboard
        window.showCreateForm = function() {
          const modal = document.getElementById('webhook-create-modal');
          if (modal) modal.style.display = 'block';
        };
        
        window.hideCreateForm = function() {
          const modal = document.getElementById('webhook-create-modal');
          if (modal) modal.style.display = 'none';
        };
        
        window.toggleWebhook = async function(id, enabled) {
          try {
            const res = await fetch('/api/webhooks/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled })
            });
            if (res.ok) loadAppContent('webhooks'); // Reload content
            else alert('Failed to toggle webhook');
          } catch (e) { alert('Error: ' + e.message); }
        };
        
        window.testWebhook = async function(id) {
          try {
            const res = await fetch('/api/webhooks/' + id + '/test', { method: 'POST' });
            const data = await res.json();
            alert(data.success ? 'Test webhook sent!' : 'Failed: ' + data.error);
          } catch (e) { alert('Error: ' + e.message); }
        };
        
        window.deleteWebhook = async function(id) {
          if (!confirm('Delete this webhook?')) return;
          try {
            const res = await fetch('/api/webhooks/' + id, { method: 'DELETE' });
            if (res.ok) {
              document.getElementById('app-webhooks').dataset.loaded = 'false';
              loadAppContent('webhooks');
            } else alert('Failed to delete webhook');
          } catch (e) { alert('Error: ' + e.message); }
        };
        
        // Plugin Dashboard
        window.discoverPlugins = async function() {
          alert('Plugin discovery triggered - this would scan for new plugins');
        };
        
        window.activatePlugin = async function(pluginId) {
          try {
            const res = await fetch('/api/plugins/' + encodeURIComponent(pluginId) + '/activate', { method: 'POST' });
            if (res.ok) {
              document.getElementById('app-plugins').dataset.loaded = 'false';
              loadAppContent('plugins');
            } else alert('Failed to activate plugin');
          } catch (e) { alert('Error: ' + e.message); }
        };
        
        window.deactivatePlugin = async function(pluginId) {
          if (!confirm('Deactivate plugin ' + pluginId + '?')) return;
          try {
            const res = await fetch('/api/plugins/' + encodeURIComponent(pluginId) + '/deactivate', { method: 'POST' });
            if (res.ok) {
              document.getElementById('app-plugins').dataset.loaded = 'false';
              loadAppContent('plugins');
            } else alert('Failed to deactivate plugin');
          } catch (e) { alert('Error: ' + e.message); }
        };
        
      })();
    `;
  }
}

module.exports = { UnifiedShell };
