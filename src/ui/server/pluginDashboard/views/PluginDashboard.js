'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * PluginDashboard - Main plugin management view
 * 
 * Renders the complete plugin management dashboard with:
 * - Header with title and "Discover Plugins" button
 * - Metrics summary row
 * - Table of all plugins with state and actions
 */
class PluginDashboard extends Control {
  constructor(spec = {}) {
    super(spec);
    
    this.plugins = spec.plugins || [];
    this.metrics = spec.metrics || {
      total: 0,
      active: 0,
      errors: 0,
      typeBreakdown: {}
    };
  }

  all_html_render() {
    const metricsHtml = this._renderMetrics();
    const pluginsHtml = this._renderPluginTable();

    return `
      <nav class="hub-nav">
        <a href="http://localhost:3000" class="hub-nav__link">← Back to Ops Hub</a>
      </nav>
      
      <header class="dashboard-header">
        <div>
          <h1 class="dashboard-header__title">🔌 Plugin Manager</h1>
          <p class="dashboard-header__subtitle">Discover, configure, and manage plugins</p>
        </div>
        <button class="btn btn--primary" data-action="discover-plugins">🔍 Discover Plugins</button>
      </header>
      
      <main class="dashboard-main">
        ${metricsHtml}
        ${pluginsHtml}
      </main>
      
      <script>
        ${this._getClientScript()}
      </script>
    `;
  }

  _renderMetrics() {
    const { total, active, errors, typeBreakdown } = this.metrics;

    return `
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-card__value">${total}</div>
          <div class="metric-card__label">Total Plugins</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-card__value">${active}</div>
          <div class="metric-card__label">Active</div>
        </div>
        <div class="metric-card${errors > 0 ? ' metric-card--danger' : ''}">
          <div class="metric-card__value">${errors}</div>
          <div class="metric-card__label">Errors</div>
        </div>
        <div class="metric-card metric-card--info">
          <div class="metric-card__value">${typeBreakdown.extractor || 0}</div>
          <div class="metric-card__label">Extractors</div>
        </div>
        <div class="metric-card metric-card--purple">
          <div class="metric-card__value">${typeBreakdown.integration || 0}</div>
          <div class="metric-card__label">Integrations</div>
        </div>
      </div>
    `;
  }

  _renderPluginTable() {
    if (this.plugins.length === 0) {
      return `
        <div class="panel">
          <h3 class="panel__title">📦 Installed Plugins</h3>
          <div class="empty-state">
            <div class="empty-state__icon">🔌</div>
            <p>No plugins discovered yet.</p>
            <p style="color: var(--text-muted);">Add plugins to the <code>plugins/</code> directory and click "Discover".</p>
            <button class="btn btn--primary" data-action="discover-plugins" style="margin-top: 16px;">
              🔍 Discover Plugins
            </button>
          </div>
        </div>
      `;
    }

    const rows = this.plugins.map(p => this._renderPluginRow(p)).join('');

    return `
      <div class="panel">
        <h3 class="panel__title">📦 Installed Plugins (${this.plugins.length})</h3>
        <table class="plugin-table">
          <thead>
            <tr>
              <th>Plugin</th>
              <th>Type</th>
              <th>Version</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderPluginRow(plugin) {
    const typeClass = `type-badge--${plugin.type}`;
    const stateClass = `state-badge--${plugin.state}`;
    
    const canActivate = ['discovered', 'loaded', 'initialized', 'deactivated'].includes(plugin.state);
    const canDeactivate = plugin.state === 'active';

    const actionButtons = [];
    if (canActivate) {
      actionButtons.push(`<button class="btn btn--secondary btn--small" data-action="activate-plugin" data-plugin-id="${this._escapeHtml(plugin.id)}">Activate</button>`);
    }
    if (canDeactivate) {
      actionButtons.push(`<button class="btn btn--danger btn--small" data-action="deactivate-plugin" data-plugin-id="${this._escapeHtml(plugin.id)}">Deactivate</button>`);
    }
    if (plugin.state === 'error') {
      actionButtons.push(`<span style="color: var(--danger-red); font-size: 12px;" title="${this._escapeHtml(plugin.error || 'Unknown error')}">⚠️ ${this._escapeHtml(plugin.error || 'Error')}</span>`);
    }

    return `
      <tr>
        <td>
          <div class="plugin-name">${this._escapeHtml(plugin.name)}</div>
          <div class="plugin-description">${this._escapeHtml(plugin.description || plugin.id)}</div>
        </td>
        <td><span class="type-badge ${typeClass}">${this._escapeHtml(plugin.type)}</span></td>
        <td><span class="version-tag">${this._escapeHtml(plugin.version)}</span></td>
        <td><span class="state-badge ${stateClass}">${this._escapeHtml(plugin.state)}</span></td>
        <td>${actionButtons.join(' ')}</td>
      </tr>
    `;
  }

  _getClientScript() {
    return `
      async function discoverPlugins() {
        try {
          var res = await fetch('/api/plugins/discover', { method: 'POST' });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
      
      async function activatePlugin(id) {
        try {
          var res = await fetch('/api/plugins/' + encodeURIComponent(id) + '/activate', { method: 'POST' });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }
      
      async function deactivatePlugin(id) {
        if (!confirm('Deactivate plugin "' + id + '"?')) return;
        
        try {
          var res = await fetch('/api/plugins/' + encodeURIComponent(id) + '/deactivate', { method: 'POST' });
          var result = await res.json();
          if (result.success) {
            location.reload();
          } else {
            alert('Error: ' + result.error);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
      }

      // Delegated handler for data-action buttons (standalone mode)
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        e.preventDefault();
        if (action === 'discover-plugins') discoverPlugins();
        else if (action === 'activate-plugin') activatePlugin(btn.dataset.pluginId);
        else if (action === 'deactivate-plugin') deactivatePlugin(btn.dataset.pluginId);
      });
    `;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = { PluginDashboard };
