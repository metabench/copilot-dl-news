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

// Styles are now loaded from src/ui/controls/DatabaseSelector.css via /assets/controls.css

// Register controls
controls.DatabaseSelector = DatabaseSelector;
controls.DatabaseItem = DatabaseItem;

module.exports = { DatabaseSelector, DatabaseItem };
