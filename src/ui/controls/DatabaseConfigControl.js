'use strict';

const { Control } = require('jsgui3-html');

/**
 * DatabaseConfigControl — Simple UI for database configuration
 * 
 * Displays current database mode and provides controls for:
 *   - Viewing database status
 *   - Switching modes (single, dual-write)
 *   - Triggering export
 *   - Monitoring export progress
 * 
 * Usage:
 *   const control = new DatabaseConfigControl({
 *     context,
 *     serverUrl: 'http://localhost:3150',
 *     compact: true // For embedding in dashboards
 *   });
 */
class DatabaseConfigControl extends Control {
  constructor(spec = {}) {
    super(spec);
    
    this.serverUrl = spec.serverUrl || 'http://localhost:3150';
    this.compact = spec.compact ?? false;
    this.status = spec.status || null;
    
    this.compose();
  }

  compose() {
    const root = this.composeRoot();
    root.add_class('db-config-control');
    
    if (this.compact) {
      this._composeCompact(root);
    } else {
      this._composeFull(root);
    }
    
    return root;
  }

  /**
   * Compact view for embedding in dashboards
   */
  _composeCompact(root) {
    const status = this.status;
    
    const wrapper = root.add({ 'class': 'db-config-compact' });
    
    // Status badge
    const badge = wrapper.add({ 'class': 'db-status-badge' });
    
    if (status) {
      const modeClass = status.mode === 'dual-write' ? 'mode-dual' : 'mode-single';
      badge.add_class(modeClass);
      
      badge.add({ 'class': 'db-icon', text: '🗄️' });
      badge.add({ 'class': 'db-mode', text: status.mode });
      
      if (status.primary) {
        badge.add({ 'class': 'db-engine', text: status.primary.engine });
      }
      
      if (status.exportInProgress) {
        badge.add({ 'class': 'db-export-indicator', text: '⏳ Exporting...' });
      }
    } else {
      badge.add({ 'class': 'db-loading', text: '⏳ Loading...' });
    }
  }

  /**
   * Full view with controls
   */
  _composeFull(root) {
    const status = this.status;
    
    // Header
    const header = root.add({ 'class': 'db-config-header' });
    header.add({ tag: 'h3', text: '🗄️ Database Configuration' });
    
    // Status panel
    const statusPanel = root.add({ 'class': 'db-status-panel' });
    
    if (status) {
      // Current mode
      const modeRow = statusPanel.add({ 'class': 'db-row' });
      modeRow.add({ 'class': 'db-label', text: 'Mode:' });
      modeRow.add({ 'class': 'db-value db-mode-value', text: status.mode });
      
      // Primary database
      if (status.primary) {
        const primaryRow = statusPanel.add({ 'class': 'db-row' });
        primaryRow.add({ 'class': 'db-label', text: 'Primary:' });
        const primaryValue = primaryRow.add({ 'class': 'db-value' });
        primaryValue.add({ 'class': 'db-engine-badge', text: status.primary.engine });
        primaryValue.add({ 
          'class': `db-status-dot ${status.primary.connected ? 'connected' : 'disconnected'}`,
          text: status.primary.connected ? '●' : '○'
        });
      }
      
      // Secondary database (if configured)
      if (status.secondary) {
        const secondaryRow = statusPanel.add({ 'class': 'db-row' });
        secondaryRow.add({ 'class': 'db-label', text: 'Secondary:' });
        const secondaryValue = secondaryRow.add({ 'class': 'db-value' });
        secondaryValue.add({ 'class': 'db-engine-badge', text: status.secondary.engine });
        secondaryValue.add({ 
          'class': `db-status-dot ${status.secondary.connected ? 'connected' : 'disconnected'}`,
          text: status.secondary.connected ? '●' : '○'
        });
      }
      
      // Export status
      if (status.exportInProgress || status.exportStats) {
        const exportRow = statusPanel.add({ 'class': 'db-row db-export-row' });
        exportRow.add({ 'class': 'db-label', text: 'Export:' });
        
        if (status.exportInProgress) {
          const progress = status.exportStats || {};
          const pct = progress.totalRows > 0 
            ? Math.round((progress.exportedRows / progress.totalRows) * 100)
            : 0;
          exportRow.add({ 'class': 'db-value db-export-progress', text: `⏳ ${pct}%` });
        } else if (status.exportStats?.status === 'complete') {
          exportRow.add({ 'class': 'db-value db-export-complete', text: '✓ Complete' });
        }
      }
    } else {
      statusPanel.add({ 'class': 'db-loading', text: 'Loading database status...' });
    }
    
    // Available modes info
    const modesPanel = root.add({ 'class': 'db-modes-panel' });
    modesPanel.add({ tag: 'h4', text: 'Available Modes' });
    
    const modesList = modesPanel.add({ tag: 'ul', 'class': 'db-modes-list' });
    modesList.add({ tag: 'li', text: 'single — Use one database only (default)' });
    modesList.add({ tag: 'li', text: 'dual-write — Write to both SQLite and PostgreSQL' });
    modesList.add({ tag: 'li', text: 'export — Migrate data from SQLite to PostgreSQL' });
    
    // Actions hint
    const actionsHint = root.add({ 'class': 'db-actions-hint' });
    actionsHint.add({ tag: 'small', text: `API: ${this.serverUrl}/api/db/status` });
  }

  /**
   * Get CSS styles for this control
   */
  static getStyles() {
    return `
      .db-config-control {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .db-config-header h3 {
        margin: 0 0 1rem 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
      
      .db-status-panel {
        background: var(--panel-bg, #f8f9fa);
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
      }
      
      .db-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }
      
      .db-row:last-child {
        margin-bottom: 0;
      }
      
      .db-label {
        font-weight: 500;
        color: var(--text-muted, #6c757d);
        min-width: 80px;
      }
      
      .db-value {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      
      .db-mode-value {
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.85rem;
        letter-spacing: 0.05em;
      }
      
      .db-engine-badge {
        background: var(--badge-bg, #e9ecef);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 500;
      }
      
      .db-status-dot {
        font-size: 0.8rem;
      }
      
      .db-status-dot.connected {
        color: var(--success, #28a745);
      }
      
      .db-status-dot.disconnected {
        color: var(--danger, #dc3545);
      }
      
      .db-export-progress {
        color: var(--warning, #ffc107);
      }
      
      .db-export-complete {
        color: var(--success, #28a745);
      }
      
      .db-modes-panel h4 {
        font-size: 0.95rem;
        margin: 0 0 0.5rem 0;
      }
      
      .db-modes-list {
        margin: 0;
        padding-left: 1.5rem;
        font-size: 0.9rem;
        color: var(--text-muted, #6c757d);
      }
      
      .db-modes-list li {
        margin-bottom: 0.25rem;
      }
      
      .db-actions-hint {
        margin-top: 1rem;
        color: var(--text-muted, #6c757d);
      }
      
      /* Compact mode styles */
      .db-config-compact {
        display: inline-block;
      }
      
      .db-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.75rem;
        background: var(--badge-bg, #e9ecef);
        border-radius: 4px;
        font-size: 0.85rem;
      }
      
      .db-status-badge.mode-dual {
        background: var(--info-bg, #d1ecf1);
        color: var(--info, #0c5460);
      }
      
      .db-status-badge.mode-single {
        background: var(--light-bg, #f8f9fa);
      }
      
      .db-icon {
        font-size: 1rem;
      }
      
      .db-mode {
        font-weight: 500;
      }
      
      .db-engine {
        opacity: 0.7;
        font-size: 0.8rem;
      }
      
      .db-export-indicator {
        color: var(--warning, #856404);
        font-size: 0.8rem;
      }
      
      .db-loading {
        color: var(--text-muted, #6c757d);
        font-style: italic;
      }
    `;
  }
}

module.exports = { DatabaseConfigControl };
