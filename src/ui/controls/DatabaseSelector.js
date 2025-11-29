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
// Context Menu Component
// ─────────────────────────────────────────────────────────────────────────────

class DatabaseContextMenu extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div', __type_name: 'database_context_menu' });
    
    this.items = spec.items || [];
    this._visible = false;
    this._targetPath = null;
    
    this.add_class('db-context-menu');
    this.dom.attributes['data-context-menu'] = 'database';
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Menu items
    for (const item of this.items) {
      const menuItem = el(ctx, 'div', null, 'db-context-menu-item');
      menuItem.dom.attributes['data-action'] = item.action;
      
      if (item.icon) {
        menuItem.add(el(ctx, 'span', item.icon, 'menu-item-icon'));
      }
      menuItem.add(el(ctx, 'span', item.label, 'menu-item-label'));
      
      if (item.shortcut) {
        menuItem.add(el(ctx, 'span', item.shortcut, 'menu-item-shortcut'));
      }
      
      this.add(menuItem);
    }
  }
  
  /**
   * Show the context menu at the given position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} targetPath - The database path that was right-clicked
   */
  show(x, y, targetPath) {
    this._targetPath = targetPath;
    this._visible = true;
    
    const el = this.dom.el;
    if (el) {
      el.style.display = 'block';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.setAttribute('data-target-path', targetPath || '');
      
      // Adjust position if menu would go off-screen
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (rect.right > viewportWidth) {
          el.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > viewportHeight) {
          el.style.top = (y - rect.height) + 'px';
        }
      });
    }
  }
  
  hide() {
    this._visible = false;
    this._targetPath = null;
    const el = this.dom.el;
    if (el) {
      el.style.display = 'none';
      el.removeAttribute('data-target-path');
    }
  }
  
  get targetPath() {
    return this._targetPath;
  }
  
  activate() {
    if (this.__active) return;
    
    // Call super.activate() first - this ensures this.dom.el is properly linked
    super.activate();
    this.__active = true;
    
    const el = this.dom.el;
    if (!el) return;
    
    // Handle menu item clicks using jsgui on() - works because super.activate() linked DOM
    this.on('click', (e) => {
      const target = e.target || e.srcElement;
      const item = target.closest ? target.closest('.db-context-menu-item') : null;
      if (item) {
        const action = item.getAttribute('data-action');
        const targetPath = el.getAttribute('data-target-path');
        
        if (action && targetPath) {
          this._handleAction(action, targetPath);
        }
        this.hide();
      }
    });
    
    // Close on click outside using body control's jsgui events
    const closeOnClickOutside = (e) => {
      const target = e.target || e.srcElement;
      if (this._visible && !el.contains(target)) {
        this.hide();
      }
    };
    
    // Close on Escape key
    const closeOnEscape = (e) => {
      if (this._visible && e.key === 'Escape') {
        this.hide();
      }
    };
    
    // Get body control from context for global event handling
    const bodyCtrl = (this.context && typeof this.context.body === 'function')
      ? this.context.body()
      : null;
    
    if (bodyCtrl) {
      // Use jsgui body control's on() for click-outside and keydown
      bodyCtrl.on('click', closeOnClickOutside);
      bodyCtrl.on('keydown', closeOnEscape);
      this._bodyListeners = { bodyCtrl, closeOnClickOutside, closeOnEscape };
    } else {
      // Fallback to direct DOM listeners if no body control available
      document.addEventListener('click', closeOnClickOutside);
      document.addEventListener('keydown', closeOnEscape);
      this._domListeners = { closeOnClickOutside, closeOnEscape };
    }
  }
  
  /**
   * Deactivate - clean up event listeners
   */
  deactivate() {
    if (!this.__active) return;
    this.__active = false;
    
    // Clean up body control listeners
    if (this._bodyListeners) {
      const { bodyCtrl, closeOnClickOutside, closeOnEscape } = this._bodyListeners;
      if (bodyCtrl && typeof bodyCtrl.off === 'function') {
        bodyCtrl.off('click', closeOnClickOutside);
        bodyCtrl.off('keydown', closeOnEscape);
      }
      this._bodyListeners = null;
    }
    
    // Clean up fallback DOM listeners
    if (this._domListeners) {
      document.removeEventListener('click', this._domListeners.closeOnClickOutside);
      document.removeEventListener('keydown', this._domListeners.closeOnEscape);
      this._domListeners = null;
    }
  }
  
  _handleAction(action, targetPath) {
    if (action === 'open-in-explorer') {
      // Send request to server to open in file explorer
      fetch('/api/geo-import/open-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      }).catch(err => {
        console.error('Failed to open in explorer:', err);
      });
    }
    
    // Dispatch custom event for other handlers
    const event = new CustomEvent('db-context-action', {
      bubbles: true,
      detail: { action, targetPath }
    });
    this.dom.el?.dispatchEvent(event);
  }
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
      isNew: false,
      hasGazetteerTables: false
    };
    this.isSelected = spec.isSelected || false;
    
    this.add_class('db-item');
    if (this.isSelected) this.add_class('selected');
    if (this.database.isDefault) this.add_class('default');
    if (this.database.isNew) this.add_class('new-db');
    if (!this.database.hasGazetteerTables && !this.database.isNew) {
      this.add_class('no-gazetteer');
    }
    
    this.dom.attributes['data-db-path'] = this.database.path;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const { name, places, names, size, isDefault, isNew, lastImport, hasGazetteerTables } = this.database;
    const ctx = this.context;
    
    // Icon - different for non-gazetteer DBs
    const iconChar = isNew ? '➕' : (hasGazetteerTables ? '🗄️' : '📦');
    const icon = el(ctx, 'span', iconChar, 'db-icon');
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
    if (!hasGazetteerTables && !isNew) {
      nameRow.add(el(ctx, 'span', '📦 No Gazetteer', 'db-badge no-gaz-badge'));
    }
    info.add(nameRow);
    
    // Stats row (only for existing databases)
    if (!isNew) {
      const statsRow = el(ctx, 'div', null, 'db-stats-row');
      
      if (hasGazetteerTables) {
        // Show gazetteer stats
        const placesText = places === -1 ? '📍 Has places' : `📍 ${formatNumber(places)} places`;
        const namesText = names === -1 ? '🏷️ Has names' : `🏷️ ${formatNumber(names)} names`;
        statsRow.add(el(ctx, 'span', placesText, 'db-stat'));
        statsRow.add(el(ctx, 'span', namesText, 'db-stat'));
        
        // For gazetteer DBs with 0 places/names but many other tables (like news.db),
        // show the other tables info as well
        const otherTableCount = this.database.otherTableCount || 0;
        if (places === 0 && names === 0 && otherTableCount > 2) {
          const tableCounts = this.database.tableCounts || [];
          if (tableCounts.length > 0 && tableCounts[0].table) {
            const previewTable = tableCounts[0].table;
            const previewCount = tableCounts[0].count;
            const countText = previewCount > 0 ? ` (${formatNumber(previewCount)})` : '';
            statsRow.add(el(ctx, 'span', `📋 +${otherTableCount} tables: ${previewTable}${countText}...`, 'db-stat hint'));
          }
        }
      } else {
        // Show non-gazetteer DB info (table count, total rows)
        const tableCount = this.database.tableCount || 0;
        const totalRows = this.database.totalRows || 0;
        const tableCounts = this.database.tableCounts || [];
        
        if (tableCount > 0) {
          statsRow.add(el(ctx, 'span', `📋 ${formatNumber(tableCount)} tables`, 'db-stat'));
          
          if (totalRows > 0) {
            const rowsText = totalRows === -1 ? 'Has data' : formatNumber(totalRows);
            statsRow.add(el(ctx, 'span', `📊 ${rowsText} rows`, 'db-stat'));
          }
          
          // Show first table name as hint
          if (tableCounts.length > 0 && tableCounts[0].table) {
            const previewTable = tableCounts[0].table;
            const previewCount = tableCounts[0].count;
            const countText = previewCount === -1 ? '' : ` (${formatNumber(previewCount)})`;
            statsRow.add(el(ctx, 'span', `🗂️ ${previewTable}${countText}...`, 'db-stat hint'));
          }
        } else {
          statsRow.add(el(ctx, 'span', '🔧 Empty or new database', 'db-stat hint'));
        }
      }
      
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
    
    // Actions container
    if (!isNew && !isDefault) {
      const actions = el(ctx, 'div', null, 'db-item-actions');
      
      if (hasGazetteerTables) {
        // Import button for gazetteer DBs
        const importBtn = el(ctx, 'button', '📥 Import', 'db-action-btn import-btn');
        importBtn.dom.attributes['data-action'] = 'import-to-main';
        importBtn.dom.attributes['data-db-path'] = this.database.path;
        importBtn.dom.attributes['title'] = 'Import this database into the main gazetteer';
        actions.add(importBtn);
      } else {
        // Initialize gazetteer button for non-gazetteer DBs
        const initBtn = el(ctx, 'button', '➕ Init Gazetteer', 'db-action-btn init-btn');
        initBtn.dom.attributes['data-action'] = 'init-gazetteer';
        initBtn.dom.attributes['data-db-path'] = this.database.path;
        initBtn.dom.attributes['title'] = 'Add gazetteer tables to this database';
        actions.add(initBtn);
      }
      this.add(actions);
    }
    
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
    this.windowTitle = spec.windowTitle || '🗄️ Database Selector';
    
    this.add_class('db-selector-window');
    this.dom.attributes['data-jsgui-control'] = 'database_selector';
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Window Title Bar (Industrial Luxury Obsidian)
    // ═══════════════════════════════════════════════════════════════════════════
    const titleBar = el(ctx, 'div', null, 'window-title-bar');
    
    // Window icon
    const windowIcon = el(ctx, 'span', '🗄️', 'window-icon');
    titleBar.add(windowIcon);
    
    // Window title
    const titleText = el(ctx, 'span', this.windowTitle, 'window-title');
    titleBar.add(titleText);
    
    // Window buttons (decorative for now)
    const btnGroup = el(ctx, 'div', null, 'window-btn-group');
    const minimizeBtn = el(ctx, 'span', '─', 'window-btn minimize');
    const maximizeBtn = el(ctx, 'span', '☐', 'window-btn maximize');
    const closeBtn = el(ctx, 'span', '✕', 'window-btn close');
    btnGroup.add(minimizeBtn);
    btnGroup.add(maximizeBtn);
    btnGroup.add(closeBtn);
    titleBar.add(btnGroup);
    
    this.add(titleBar);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Window Content
    // ═══════════════════════════════════════════════════════════════════════════
    const windowContent = el(ctx, 'div', null, 'window-content');
    
    // Header
    const header = el(ctx, 'div', null, 'db-selector-header');
    header.add(el(ctx, 'h3', '🗄️ Select Database'));
    header.add(el(ctx, 'p', 'Choose an existing database or create a new one', 'db-selector-subtitle'));
    windowContent.add(header);
    
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
    
    windowContent.add(quickBar);
    
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
    windowContent.add(listContainer);
    
    // Selected database info panel
    const infoPanel = el(ctx, 'div', null, 'db-info-panel');
    infoPanel.dom.attributes['data-panel'] = 'selected-info';
    this._composeInfoPanel(infoPanel);
    windowContent.add(infoPanel);
    
    // Add window content to main control
    this.add(windowContent);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // Context Menu (hidden by default)
    // ═══════════════════════════════════════════════════════════════════════════
    this._contextMenu = new DatabaseContextMenu({
      context: ctx,
      items: [
        { action: 'open-in-explorer', icon: '📂', label: 'Open in Explorer' }
      ]
    });
    this.add(this._contextMenu);
  }
  
  /**
   * Activate the control - sets up event handlers using jsgui events
   * Following jsgui3 pattern: super.activate() first, then this.on() for DOM events
   */
  activate() {
    if (this.__active) return;
    
    // Call super.activate() first - this links this.dom.el to the actual DOM element
    super.activate();
    this.__active = true;
    
    const el = this.dom.el;
    if (!el) return;
    
    // Activate context menu child control
    if (this._contextMenu) {
      this._contextMenu.activate();
    }
    
    // Handle right-click on database items using jsgui on() method
    // This works because super.activate() has already linked dom.el
    this.on('contextmenu', (e) => {
      const target = e.target || e.srcElement;
      const dbItem = target.closest ? target.closest('.db-item') : null;
      if (dbItem) {
        e.preventDefault();
        const dbPath = dbItem.getAttribute('data-db-path');
        
        // Don't show context menu for "create new" item
        if (dbPath && dbPath !== '__new__') {
          this._contextMenu.show(e.clientX, e.clientY, dbPath);
        }
      }
    });
  }
  
  /**
   * Deactivate - clean up event listeners
   */
  deactivate() {
    if (!this.__active) return;
    this.__active = false;
    
    // Deactivate context menu
    if (this._contextMenu && typeof this._contextMenu.deactivate === 'function') {
      this._contextMenu.deactivate();
    }
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
    
    // Import actions section
    const actionsSection = el(ctx, 'div', null, 'info-actions');
    actionsSection.add(el(ctx, 'div', '🔄 Import Actions', 'actions-title'));
    
    const actionBtns = el(ctx, 'div', null, 'action-buttons');
    
    if (selectedDb.isDefault) {
      // Default database - can import FROM other sources
      const importFromBtn = el(ctx, 'button', '📥 Import from Source...', 'action-btn primary');
      importFromBtn.dom.attributes['data-action'] = 'import-from-source';
      importFromBtn.dom.attributes['title'] = 'Import geographic data from external sources (GeoNames, etc.)';
      actionBtns.add(importFromBtn);
      
      const mergeBtn = el(ctx, 'button', '🔀 Merge Database...', 'action-btn');
      mergeBtn.dom.attributes['data-action'] = 'merge-database';
      mergeBtn.dom.attributes['title'] = 'Merge another gazetteer database into this one';
      actionBtns.add(mergeBtn);
    } else {
      // Non-default database - can import TO main
      const importToMainBtn = el(ctx, 'button', '📤 Import to Main Database', 'action-btn primary');
      importToMainBtn.dom.attributes['data-action'] = 'import-to-main';
      importToMainBtn.dom.attributes['data-db-path'] = selectedDb.path;
      importToMainBtn.dom.attributes['title'] = 'Import all data from this database into the main gazetteer';
      actionBtns.add(importToMainBtn);
      
      const exportBtn = el(ctx, 'button', '📁 Export to File...', 'action-btn');
      exportBtn.dom.attributes['data-action'] = 'export-database';
      exportBtn.dom.attributes['data-db-path'] = selectedDb.path;
      exportBtn.dom.attributes['title'] = 'Export this database to JSON/CSV';
      actionBtns.add(exportBtn);
    }
    
    actionsSection.add(actionBtns);
    panel.add(actionsSection);
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
controls.DatabaseContextMenu = DatabaseContextMenu;

module.exports = { DatabaseSelector, DatabaseItem, DatabaseContextMenu };
