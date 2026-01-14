'use strict';

/**
 * DatabaseSelector - File explorer for selecting gazetteer databases
 * 
 * Features:
 * - List existing .db files in data directory
 * - Quick select for default databases
 * - Create new database option
 * - Show database stats (places, names count)
 * - Remember recent selections
 * 
 * @example
 *   const selector = new DatabaseSelector({
 *     context,
 *     databases: [
 *       { path: 'data/gazetteer.db', name: 'gazetteer.db', places: 508, names: 14855 },
 *       ...
 *     ],
 *     selected: 'data/gazetteer.db',
 *     onSelect: (dbPath) => console.log('Selected:', dbPath)
 *   });
 */

const jsgui = require('jsgui3-html');
const { Control, controls } = jsgui;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function el(ctx, tag, content, className) {
  const ctrl = new Control({ context: ctx, tagName: tag });
  if (className) ctrl.add_class(className);
  if (content) ctrl.add(content);
  return ctrl;
}

function formatNumber(n) {
  return typeof n === 'number' ? n.toLocaleString() : (n || '0');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Item Component
// ─────────────────────────────────────────────────────────────────────────────

class DatabaseItem extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'database_item' });
    
    this.database = spec.database || {
      path: '',
      name: 'Unknown',
      places: 0,
      names: 0,
      size: 0,
      isDefault: false,
      isNew: false
    };
    this.isSelected = spec.isSelected || false;
    
    this.add_class('db-item');
    if (this.isSelected) this.add_class('selected');
    if (this.database.isDefault) this.add_class('default');
    if (this.database.isNew) this.add_class('new-db');
    
    this.dom.attributes['data-db-path'] = this.database.path;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const { name, places, names, size, isDefault, isNew, lastImport } = this.database;
    const ctx = this.context;
    
    // Icon
    const icon = el(ctx, 'span', isNew ? '➕' : '🗄️', 'db-icon');
    this.add(icon);
    
    // Info container
    const info = el(ctx, 'div', null, 'db-info');
    
    // Name row
    const nameRow = el(ctx, 'div', null, 'db-name-row');
    nameRow.add(el(ctx, 'span', name, 'db-name'));
    if (isDefault) {
      nameRow.add(el(ctx, 'span', '⭐ Default', 'db-badge default-badge'));
    }
    if (isNew) {
      nameRow.add(el(ctx, 'span', 'Create New', 'db-badge new-badge'));
    }
    info.add(nameRow);
    
    // Stats row (only for existing databases)
    if (!isNew) {
      const statsRow = el(ctx, 'div', null, 'db-stats-row');
      statsRow.add(el(ctx, 'span', `📍 ${formatNumber(places)} places`, 'db-stat'));
      statsRow.add(el(ctx, 'span', `🏷️ ${formatNumber(names)} names`, 'db-stat'));
      if (size) {
        statsRow.add(el(ctx, 'span', `💾 ${formatFileSize(size)}`, 'db-stat'));
      }
      info.add(statsRow);
      
      // Last import info
      if (lastImport) {
        info.add(el(ctx, 'div', `Last import: ${lastImport}`, 'db-last-import'));
      }
    }
    
    this.add(info);
    
    // Selection indicator
    const check = el(ctx, 'span', this.isSelected ? '✓' : '', 'db-check');
    this.add(check);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Database Selector Component
// ─────────────────────────────────────────────────────────────────────────────

class DatabaseSelector extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'database_selector' });
    
    this.databases = spec.databases || [];
    this.selected = spec.selected || null;
    this.dataDir = spec.dataDir || 'data';
    this.showCreateNew = spec.showCreateNew !== false;
    this._newDbName = '';
    
    this.add_class('database-selector');
    this.dom.attributes['data-jsgui-control'] = 'database_selector';
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Header
    const header = el(ctx, 'div', null, 'db-selector-header');
    header.add(el(ctx, 'h3', '🗄️ Select Database'));
    header.add(el(ctx, 'p', 'Choose an existing database or create a new one', 'db-selector-subtitle'));
    this.add(header);
    
    // Quick actions bar
    const quickBar = el(ctx, 'div', null, 'db-quick-actions');
    
    // Default database button
    const defaultBtn = el(ctx, 'button', '⭐ Use Default', 'quick-btn');
    defaultBtn.dom.attributes['data-action'] = 'select-default';
    quickBar.add(defaultBtn);
    
    // Refresh button
    const refreshBtn = el(ctx, 'button', '🔄 Refresh', 'quick-btn secondary');
    refreshBtn.dom.attributes['data-action'] = 'refresh-list';
    quickBar.add(refreshBtn);
    
    this.add(quickBar);
    
    // Database list
    const listContainer = el(ctx, 'div', null, 'db-list-container');
    
    // Create new database option (at top)
    if (this.showCreateNew) {
      const createSection = el(ctx, 'div', null, 'db-create-section');
      
      const createItem = new DatabaseItem({
        context: ctx,
        database: {
          path: '__new__',
          name: 'New Gazetteer Database',
          isNew: true
        },
        isSelected: this.selected === '__new__'
      });
      createSection.add(createItem);
      
      // New database name input (hidden by default)
      const inputGroup = el(ctx, 'div', null, 'db-new-input-group');
      inputGroup.dom.attributes['data-visible'] = 'false';
      
      const input = new Control({ context: ctx, tagName: 'input' });
      input.add_class('db-new-name-input');
      input.dom.attributes = {
        type: 'text',
        placeholder: 'my-gazetteer.db',
        'data-input': 'new-db-name'
      };
      inputGroup.add(input);
      
      const createBtn = el(ctx, 'button', '✨ Create', 'create-db-btn');
      createBtn.dom.attributes['data-action'] = 'create-new-db';
      inputGroup.add(createBtn);
      
      createSection.add(inputGroup);
      listContainer.add(createSection);
    }
    
    // Separator
    listContainer.add(el(ctx, 'div', null, 'db-list-separator'));
    
    // Existing databases
    const dbList = el(ctx, 'div', null, 'db-list');
    dbList.dom.attributes['data-list'] = 'databases';
    
    for (const database of this.databases) {
      const item = new DatabaseItem({
        context: ctx,
        database,
        isSelected: this.selected === database.path
      });
      dbList.add(item);
    }
    
    // Empty state
    if (this.databases.length === 0) {
      const empty = el(ctx, 'div', null, 'db-empty-state');
      empty.add(el(ctx, 'span', '📂', 'empty-icon'));
      empty.add(el(ctx, 'p', 'No gazetteer databases found'));
      empty.add(el(ctx, 'p', 'Create a new one to get started', 'empty-hint'));
      dbList.add(empty);
    }
    
    listContainer.add(dbList);
    this.add(listContainer);
    
    // Selected database info panel
    const infoPanel = el(ctx, 'div', null, 'db-info-panel');
    infoPanel.dom.attributes['data-panel'] = 'selected-info';
    this._composeInfoPanel(infoPanel);
    this.add(infoPanel);
  }
  
  _composeInfoPanel(panel) {
    const ctx = this.context;
    const selectedDb = this.databases.find(d => d.path === this.selected);
    
    if (!selectedDb && this.selected !== '__new__') {
      panel.add(el(ctx, 'p', 'Select a database to view details', 'info-placeholder'));
      return;
    }
    
    if (this.selected === '__new__') {
      panel.add(el(ctx, 'div', '➕ Creating new database', 'info-title'));
      panel.add(el(ctx, 'p', 'Enter a name above and click Create', 'info-hint'));
      return;
    }
    
    // Selected database details
    panel.add(el(ctx, 'div', `📊 ${selectedDb.name}`, 'info-title'));
    
    const statsGrid = el(ctx, 'div', null, 'info-stats-grid');
    statsGrid.add(this._createInfoStat('Places', selectedDb.places, '📍'));
    statsGrid.add(this._createInfoStat('Names', selectedDb.names, '🏷️'));
    statsGrid.add(this._createInfoStat('Size', formatFileSize(selectedDb.size), '💾'));
    if (selectedDb.sources) {
      statsGrid.add(this._createInfoStat('Sources', selectedDb.sources.length, '📦'));
    }
    panel.add(statsGrid);
    
    // Path display
    const pathRow = el(ctx, 'div', null, 'info-path');
    pathRow.add(el(ctx, 'span', 'Path: ', 'path-label'));
    pathRow.add(el(ctx, 'code', selectedDb.path, 'path-value'));
    panel.add(pathRow);
  }
  
  _createInfoStat(label, value, emoji) {
    const ctx = this.context;
    const stat = el(ctx, 'div', null, 'info-stat');
    stat.add(el(ctx, 'span', emoji, 'stat-emoji'));
    stat.add(el(ctx, 'span', formatNumber(value), 'stat-value'));
    stat.add(el(ctx, 'span', label, 'stat-label'));
    return stat;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Styles
// ─────────────────────────────────────────────────────────────────────────────

DatabaseSelector.getStyles = function() {
  return `
    .database-selector {
      background: var(--surface-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }
    
    .db-selector-header {
      margin-bottom: 16px;
    }
    
    .db-selector-header h3 {
      margin: 0 0 4px 0;
      font-size: 1.1rem;
    }
    
    .db-selector-subtitle {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin: 0;
    }
    
    /* Quick actions */
    .db-quick-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .quick-btn {
      padding: 8px 16px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-color);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
    }
    
    .quick-btn:hover {
      background: var(--accent-color);
      border-color: var(--accent-color);
    }
    
    .quick-btn.secondary {
      background: transparent;
    }
    
    /* Database list */
    .db-list-container {
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 16px;
    }
    
    .db-list-separator {
      height: 1px;
      background: var(--border-color);
      margin: 12px 0;
    }
    
    .db-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    /* Database item */
    .db-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .db-item:hover {
      border-color: var(--accent-color);
      background: rgba(88, 166, 255, 0.05);
    }
    
    .db-item.selected {
      border-color: var(--accent-color);
      background: rgba(88, 166, 255, 0.1);
    }
    
    .db-item.new-db {
      border-style: dashed;
    }
    
    .db-item.new-db:hover {
      border-style: solid;
    }
    
    .db-icon {
      font-size: 1.5rem;
      width: 40px;
      text-align: center;
    }
    
    .db-info {
      flex: 1;
      min-width: 0;
    }
    
    .db-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    
    .db-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .db-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 500;
    }
    
    .default-badge {
      background: rgba(88, 166, 255, 0.2);
      color: var(--accent-color);
    }
    
    .new-badge {
      background: rgba(59, 185, 80, 0.2);
      color: var(--success-color);
    }
    
    .db-stats-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .db-stat {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    .db-last-import {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }
    
    .db-check {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--success-color);
      color: white;
      font-size: 0.875rem;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .db-item.selected .db-check {
      opacity: 1;
    }
    
    /* Create new database */
    .db-create-section {
      margin-bottom: 8px;
    }
    
    .db-new-input-group {
      display: none;
      gap: 8px;
      margin-top: 8px;
      padding: 12px;
      background: var(--bg-color);
      border-radius: 6px;
    }
    
    .db-new-input-group[data-visible="true"] {
      display: flex;
    }
    
    .db-new-name-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--surface-color);
      color: var(--text-primary);
      font-size: 0.875rem;
    }
    
    .db-new-name-input:focus {
      outline: none;
      border-color: var(--accent-color);
    }
    
    .create-db-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--success-color);
      color: white;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }
    
    .create-db-btn:hover {
      background: #2ea043;
    }
    
    /* Empty state */
    .db-empty-state {
      text-align: center;
      padding: 32px;
      color: var(--text-secondary);
    }
    
    .empty-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 12px;
    }
    
    .empty-hint {
      font-size: 0.875rem;
      opacity: 0.7;
    }
    
    /* Info panel */
    .db-info-panel {
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 16px;
    }
    
    .info-placeholder {
      color: var(--text-secondary);
      text-align: center;
      margin: 0;
    }
    
    .info-title {
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .info-hint {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin: 8px 0 0 0;
    }
    
    .info-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .info-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      background: var(--surface-color);
      border-radius: 4px;
    }
    
    .info-stat .stat-emoji {
      font-size: 1.25rem;
      margin-bottom: 4px;
    }
    
    .info-stat .stat-value {
      font-size: 1.25rem;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .info-stat .stat-label {
      font-size: 0.7rem;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    .info-path {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    
    .info-path code {
      background: var(--surface-color);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }
  `;
};

// Register controls
controls.DatabaseSelector = DatabaseSelector;
controls.DatabaseItem = DatabaseItem;

module.exports = { DatabaseSelector, DatabaseItem };
