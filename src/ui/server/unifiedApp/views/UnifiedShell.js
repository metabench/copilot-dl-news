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
                  title="${app.description}">
            <span class="nav-item__icon">${app.icon}</span>
            <span class="nav-item__label">${app.label}</span>
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
        
        // Load app content from server
        async function loadAppContent(appId) {
          const container = document.getElementById('app-' + appId);
          if (!container) return;
          
          // Already loaded?
          if (container.dataset.loaded === 'true') return;
          
          container.innerHTML = '<div class="app-loading">Loading...</div>';
          
          try {
            const response = await fetch('/api/apps/' + appId + '/content');
            const data = await response.json();
            
            if (data.error) {
              container.innerHTML = '<div class="app-placeholder"><p>Error</p><p class="error">' + data.error + '</p></div>';
            } else {
              container.innerHTML = data.content;
              container.dataset.loaded = 'true';
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
