'use strict';

/**
 * TwoColumnLayoutFactory - Shared factory for 2-column navigation + detail layouts
 * 
 * Creates reusable controls for dashboards with:
 * - Left sidebar with navigation items
 * - Right content area with detail view
 * - Compact, industrial styling
 * 
 * Event Flow (using jsgui3 native events - .on() / .raise()):
 * - NavItem raises 'select' → Sidebar subscribes and re-raises 'nav-select'
 * - Sidebar raises 'nav-select' → TwoColumnLayout subscribes and re-raises 'view-change'
 * - Parent dashboard subscribes to layout's 'view-change' to handle navigation
 * 
 * Pattern: Factory function receives jsgui instance, returns controls + buildStyles
 * 
 * @example
 * const { TwoColumnLayout, Sidebar, ContentArea, NavItem, buildStyles } = 
 *   createTwoColumnLayoutControls(jsgui);
 * 
 * const layout = new TwoColumnLayout({ context });
 * layout.sidebar.addNavItem({ id: 'dashboard', label: 'Dashboard', icon: '📊' });
 * 
 * // Subscribe to view changes using jsgui3 events
 * layout.on('view-change', (data) => {
 *   console.log('View changed to:', data.id);
 * });
 * 
 * const html = layout.all_html_render();
 * 
 * @module TwoColumnLayoutFactory
 */

/**
 * Create two-column layout controls for the given jsgui instance
 * @param {Object} jsgui - jsgui3-html instance
 * @returns {{ TwoColumnLayout, Sidebar, ContentArea, NavItem, DetailHeader, buildStyles }}
 */
function createTwoColumnLayoutControls(jsgui) {
  const { Control } = jsgui;

  // ─────────────────────────────────────────────────────────────────────────
  // NavItem - Single navigation item in sidebar
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * NavItem control - represents a single navigation item in the sidebar
   * 
   * Events:
   * - 'select': Raised when the item is clicked, with { id, label } data
   * 
   * @class NavItem
   * @extends Control
   */
  class NavItem extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'div', __type_name: 'nav_item' });
      
      this.itemId = spec.id || 'item';
      this.label = spec.label || 'Item';
      this.icon = spec.icon || '📄';
      this.badge = spec.badge || null;
      this.selected = spec.selected || false;
      
      this.add_class('nav-item');
      this.dom.attributes['data-nav-id'] = this.itemId;
      
      if (this.selected) {
        this.add_class('nav-item--selected');
      }
      
      if (!spec.el) this.compose();
    }
    
    compose() {
      const ctx = this.context;
      
      // Icon
      const iconEl = new Control({ context: ctx, tagName: 'span' });
      iconEl.add_class('nav-item__icon');
      iconEl.add(this.icon);
      this.add(iconEl);
      
      // Label
      const labelEl = new Control({ context: ctx, tagName: 'span' });
      labelEl.add_class('nav-item__label');
      labelEl.add(this.label);
      this.add(labelEl);
      
      // Optional badge
      if (this.badge !== null) {
        const badgeEl = new Control({ context: ctx, tagName: 'span' });
        badgeEl.add_class('nav-item__badge');
        badgeEl.add(String(this.badge));
        this.add(badgeEl);
      }
    }
    
    /**
     * Activate the control - binds DOM click to jsgui3 event
     */
    activate() {
      if (this.__active) return;
      super.activate();
      
      // Bind DOM click to raise jsgui3 'select' event
      if (this.dom.el) {
        this.dom.el.addEventListener('click', () => {
          // Use jsgui3's native event system
          this.raise('select', { id: this.itemId, label: this.label });
        });
      }
    }
    
    /**
     * Update visual selection state
     * @param {boolean} selected - Whether item is selected
     */
    setSelected(selected) {
      this.selected = selected;
      if (this.dom.el) {
        this.dom.el.classList.toggle('nav-item--selected', selected);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar - Left navigation panel
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sidebar control - contains navigation items and handles selection
   * 
   * Events:
   * - 'nav-select': Raised when a nav item is selected, with { id, label } data
   * 
   * @class Sidebar
   * @extends Control
   */
  class Sidebar extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'aside', __type_name: 'sidebar' });
      
      this.title = spec.title || 'Navigation';
      this.titleIcon = spec.titleIcon || '☰';
      this.items = spec.items || [];
      this.selectedId = spec.selectedId || null;
      
      this._headerEl = null;
      this._navList = null;
      this._navItems = new Map();
      
      this.add_class('layout-sidebar');
      
      if (!spec.el) this.compose();
    }
    
    compose() {
      const ctx = this.context;
      
      // Header
      this._headerEl = new Control({ context: ctx, tagName: 'div' });
      this._headerEl.add_class('sidebar-header');
      
      const headerIcon = new Control({ context: ctx, tagName: 'span' });
      headerIcon.add_class('sidebar-header__icon');
      headerIcon.add(this.titleIcon);
      this._headerEl.add(headerIcon);
      
      const headerTitle = new Control({ context: ctx, tagName: 'span' });
      headerTitle.add_class('sidebar-header__title');
      headerTitle.add(this.title);
      this._headerEl.add(headerTitle);
      
      this.add(this._headerEl);
      
      // Nav list
      this._navList = new Control({ context: ctx, tagName: 'nav' });
      this._navList.add_class('sidebar-nav');
      
      for (const item of this.items) {
        this.addNavItem(item);
      }
      
      this.add(this._navList);
    }
    
    /**
     * Add a navigation item to the sidebar
     * @param {Object} spec - NavItem configuration
     * @returns {NavItem} The created nav item
     */
    addNavItem(spec) {
      const ctx = this.context;
      const navItem = new NavItem({
        context: ctx,
        ...spec,
        selected: spec.id === this.selectedId
      });
      
      // Subscribe to child's 'select' event and re-raise as 'nav-select'
      // This is the jsgui3-idiomatic pattern for event propagation
      navItem.on('select', (data) => {
        this.setSelected(data.id);
        this.raise('nav-select', data);
      });
      
      this._navItems.set(spec.id, navItem);
      this._navList.add(navItem);
      return navItem;
    }
    
    /**
     * Set the selected navigation item
     * @param {string} itemId - ID of the item to select
     */
    setSelected(itemId) {
      this.selectedId = itemId;
      for (const [id, item] of this._navItems) {
        item.setSelected(id === itemId);
      }
    }
    
    /**
     * Activate the sidebar and its children
     * No additional event binding needed - events are wired in addNavItem
     */
    activate() {
      if (this.__active) return;
      super.activate();
      // Child NavItems are activated via super.activate() which walks the tree
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DetailHeader - Header for the content area
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * DetailHeader control - displays title and subtitle for content area
   * @class DetailHeader
   * @extends Control
   */
  class DetailHeader extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'header', __type_name: 'detail_header' });
      
      this.title = spec.title || 'Details';
      this.titleIcon = spec.titleIcon || '📋';
      this.subtitle = spec.subtitle || null;
      
      this.add_class('detail-header');
      
      if (!spec.el) this.compose();
    }
    
    compose() {
      const ctx = this.context;
      
      // Title row
      const titleRow = new Control({ context: ctx, tagName: 'div' });
      titleRow.add_class('detail-header__title-row');
      
      const icon = new Control({ context: ctx, tagName: 'span' });
      icon.add_class('detail-header__icon');
      icon.add(this.titleIcon);
      titleRow.add(icon);
      
      const title = new Control({ context: ctx, tagName: 'h2' });
      title.add_class('detail-header__title');
      title.add(this.title);
      titleRow.add(title);
      
      this.add(titleRow);
      
      // Subtitle
      if (this.subtitle) {
        const subtitle = new Control({ context: ctx, tagName: 'p' });
        subtitle.add_class('detail-header__subtitle');
        subtitle.add(this.subtitle);
        this.add(subtitle);
      }
    }
    
    /**
     * Update the header title (for dynamic updates)
     * @param {string} title - New title text
     * @param {string} [icon] - Optional new icon
     */
    setTitle(title, icon = null) {
      this.title = title;
      if (icon) this.titleIcon = icon;
      // Re-render would happen via full page update in server-rendered apps
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ContentArea - Right detail panel
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * ContentArea control - the main content panel with optional header
   * @class ContentArea
   * @extends Control
   */
  class ContentArea extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'main', __type_name: 'content_area' });
      
      this.title = spec.title || 'Details';
      this.titleIcon = spec.titleIcon || '📋';
      this.subtitle = spec.subtitle || null;
      this.showHeader = spec.showHeader !== false;
      
      this._header = null;
      this._body = null;
      
      this.add_class('layout-content');
      
      if (!spec.el) this.compose();
    }
    
    compose() {
      const ctx = this.context;
      
      // Optional header
      if (this.showHeader) {
        this._header = new DetailHeader({
          context: ctx,
          title: this.title,
          titleIcon: this.titleIcon,
          subtitle: this.subtitle
        });
        this.add(this._header);
      }
      
      // Body container for content
      this._body = new Control({ context: ctx, tagName: 'div' });
      this._body.add_class('content-body');
      this.add(this._body);
    }
    
    /**
     * Add content to the body area
     * @param {Control|string} content - Control or string to add
     */
    addContent(content) {
      if (this._body) {
        this._body.add(content);
      } else {
        this.add(content);
      }
    }
    
    /**
     * Get the body control for direct manipulation
     * @returns {Control} The body control
     */
    getBody() {
      return this._body;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TwoColumnLayout - Root container combining sidebar + content
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * TwoColumnLayout control - combines sidebar and content area
   * 
   * Events:
   * - 'view-change': Raised when navigation selection changes, with { id, label } data
   * 
   * @class TwoColumnLayout
   * @extends Control
   */
  class TwoColumnLayout extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: 'div', __type_name: 'two_column_layout' });
      
      this.sidebarTitle = spec.sidebarTitle || 'Navigation';
      this.sidebarIcon = spec.sidebarIcon || '☰';
      this.sidebarWidth = spec.sidebarWidth || 280;
      this.navItems = spec.navItems || [];
      this.selectedId = spec.selectedId || null;
      
      this.contentTitle = spec.contentTitle || 'Details';
      this.contentIcon = spec.contentIcon || '📋';
      this.contentSubtitle = spec.contentSubtitle || null;
      
      this.sidebar = null;
      this.contentArea = null;  // IMPORTANT: Don't use 'content' - it shadows base class Collection!
      
      this.add_class('two-column-layout');
      this.dom.attributes['data-jsgui-control'] = 'two_column_layout';
      
      if (!spec.el) this.compose();
    }
    
    compose() {
      const ctx = this.context;
      
      // Sidebar
      this.sidebar = new Sidebar({
        context: ctx,
        title: this.sidebarTitle,
        titleIcon: this.sidebarIcon,
        items: this.navItems,
        selectedId: this.selectedId
      });
      
      // Subscribe to sidebar's nav-select and re-raise as view-change
      this.sidebar.on('nav-select', (data) => {
        this.raise('view-change', data);
      });
      
      this.add(this.sidebar);
      
      // Content area
      this.contentArea = new ContentArea({
        context: ctx,
        title: this.contentTitle,
        titleIcon: this.contentIcon,
        subtitle: this.contentSubtitle
      });
      this.add(this.contentArea);
    }
    
    /**
     * Add navigation item to sidebar
     * @param {Object} spec - NavItem configuration
     * @returns {NavItem} The created nav item
     */
    addNavItem(spec) {
      return this.sidebar.addNavItem(spec);
    }
    
    /**
     * Add content to detail area
     * @param {Control} ctrl - Control to add
     */
    addContent(ctrl) {
      this.contentArea.addContent(ctrl);
    }
    
    /**
     * Set selected navigation item
     * @param {string} itemId - ID of item to select
     */
    setSelected(itemId) {
      this.sidebar.setSelected(itemId);
    }
    
    /**
     * Activate the layout
     * Event wiring is done in compose() - no additional work needed here
     */
    activate() {
      if (this.__active) return;
      super.activate();
      // Event subscriptions are already wired in compose()
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CSS Builder
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build CSS for two-column layout
   * @param {Object} options - Style options
   * @param {number} options.sidebarWidth - Sidebar width in px (default: 280)
   * @param {string} options.theme - 'dark' or 'light' (default: 'dark')
   * @returns {string} CSS string
   */
  function buildStyles(options = {}) {
    const sidebarWidth = options.sidebarWidth || 280;
    const theme = options.theme || 'dark';
    
    // Theme colors
    const colors = theme === 'dark' ? {
      bg: 'rgba(10, 13, 20, 0.99)',
      bgSidebar: 'rgba(15, 18, 25, 0.98)',
      bgContent: 'rgba(20, 24, 32, 0.95)',
      border: 'rgba(201, 162, 39, 0.15)',
      borderHover: 'rgba(201, 162, 39, 0.35)',
      text: 'rgba(255, 255, 255, 0.9)',
      textMuted: 'rgba(255, 255, 255, 0.6)',
      accent: '#c9a227',
      accentDim: 'rgba(201, 162, 39, 0.25)',
      itemHover: 'rgba(201, 162, 39, 0.1)',
      itemSelected: 'rgba(201, 162, 39, 0.2)'
    } : {
      bg: '#f5f5f5',
      bgSidebar: '#ffffff',
      bgContent: '#fafafa',
      border: 'rgba(0, 0, 0, 0.1)',
      borderHover: 'rgba(0, 0, 0, 0.2)',
      text: 'rgba(0, 0, 0, 0.87)',
      textMuted: 'rgba(0, 0, 0, 0.54)',
      accent: '#1976d2',
      accentDim: 'rgba(25, 118, 210, 0.15)',
      itemHover: 'rgba(0, 0, 0, 0.04)',
      itemSelected: 'rgba(25, 118, 210, 0.12)'
    };

    return `
/* ════════════════════════════════════════════════════════════════════════════
   Two Column Layout - Shared Styles
   ════════════════════════════════════════════════════════════════════════════ */

.two-column-layout {
  display: flex;
  min-height: 100vh;
  background: ${colors.bg};
  color: ${colors.text};
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sidebar
   ───────────────────────────────────────────────────────────────────────────── */

.layout-sidebar {
  width: ${sidebarWidth}px;
  min-width: ${sidebarWidth}px;
  background: ${colors.bgSidebar};
  border-right: 1px solid ${colors.border};
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid ${colors.border};
  background: linear-gradient(135deg, ${colors.accentDim} 0%, transparent 100%);
}

.sidebar-header__icon {
  font-size: 20px;
  opacity: 0.8;
}

.sidebar-header__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: ${colors.accent};
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Nav Item
   ───────────────────────────────────────────────────────────────────────────── */

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  border-left: 3px solid transparent;
  user-select: none;
}

.nav-item:hover {
  background: ${colors.itemHover};
  border-left-color: ${colors.borderHover};
}

.nav-item--selected {
  background: ${colors.itemSelected};
  border-left-color: ${colors.accent};
}

.nav-item--selected .nav-item__label {
  color: ${colors.accent};
  font-weight: 600;
}

.nav-item__icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  opacity: 0.85;
}

.nav-item__label {
  flex: 1;
  font-size: 14px;
  color: ${colors.text};
}

.nav-item__badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: ${colors.accentDim};
  color: ${colors.accent};
  font-weight: 600;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Content Area
   ───────────────────────────────────────────────────────────────────────────── */

.layout-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${colors.bgContent};
  overflow: hidden;
}

.detail-header {
  padding: 20px 24px;
  border-bottom: 1px solid ${colors.border};
  background: linear-gradient(180deg, ${colors.accentDim} 0%, transparent 100%);
}

.detail-header__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-header__icon {
  font-size: 24px;
  opacity: 0.9;
}

.detail-header__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: ${colors.text};
}

.detail-header__subtitle {
  margin: 6px 0 0 36px;
  font-size: 13px;
  color: ${colors.textMuted};
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Responsive
   ───────────────────────────────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .two-column-layout {
    flex-direction: column;
  }
  
  .layout-sidebar {
    width: 100%;
    min-width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid ${colors.border};
  }
  
  .sidebar-nav {
    display: flex;
    flex-wrap: wrap;
    padding: 8px;
  }
  
  .nav-item {
    padding: 8px 12px;
    border-left: none;
    border-bottom: 2px solid transparent;
    flex: 0 0 auto;
  }
  
  .nav-item--selected {
    border-bottom-color: ${colors.accent};
  }
}
`;
  }

  return {
    TwoColumnLayout,
    Sidebar,
    ContentArea,
    DetailHeader,
    NavItem,
    buildStyles
  };
}

module.exports = { createTwoColumnLayoutControls };
