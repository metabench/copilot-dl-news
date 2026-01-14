"use strict";

/**
 * DocNavControl - Navigation tree for documentation
 * 
 * Renders a collapsible tree of documentation files and folders
 * in the left column of the docs viewer.
 * 
 * Features:
 * - Collapsible folder tree
 * - File type filtering (.md, .svg)
 * - Optional columns (Last Modified)
 * - Sorting by name or date (asc/desc)
 * - Right-click header menu for column selection
 */

const jsgui = require("../jsgui");

const StringControl = jsgui.String_Control;

/**
 * Navigation control for the documentation tree
 */
class DocNavControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.docTree - Array of doc tree nodes
   * @param {string} spec.selectedPath - Currently selected document path
   * @param {string} spec.basePath - Base URL path for links
   * @param {Object} spec.filters - File type filters { md: boolean, svg: boolean }
   * @param {Object} spec.columns - Column visibility { mtime: boolean }
   * @param {string} spec.sortBy - Sort field ('name' or 'mtime')
   * @param {string} spec.sortOrder - Sort order ('asc' or 'desc')
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "nav" });
    
    this.docTree = spec.docTree || [];
    this.selectedPath = spec.selectedPath || null;
    this.basePath = spec.basePath || "/";
    this.filters = spec.filters || { md: true, svg: true };
    this.columns = spec.columns || { mtime: false };
    this.sortBy = spec.sortBy || 'name';
    this.sortOrder = spec.sortOrder || 'asc';
    
    this.add_class("doc-nav");
    this.dom.attributes["aria-label"] = "Documentation navigation";
    
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: "div" });
    header.add_class("doc-nav__header");
    
    const title = new jsgui.Control({ context: this.context, tagName: "h2" });
    title.add_class("doc-nav__title");
    title.add(new StringControl({ context: this.context, text: "Documentation" }));
    header.add(title);
    
    // Search input - with jsgui control marker for client hydration
    const searchBox = new jsgui.Control({ context: this.context, tagName: "div" });
    searchBox.add_class("doc-nav__search");
    
    // Magnifying glass emoji for visual discoverability
    const searchIcon = new jsgui.Control({ context: this.context, tagName: "span" });
    searchIcon.add_class("doc-nav__search-icon");
    searchIcon.add("🔍");
    searchBox.add(searchIcon);
    
    const searchInput = new jsgui.Control({ context: this.context, tagName: "input" });
    searchInput.dom.attributes.type = "text";
    searchInput.dom.attributes.placeholder = "Search docs...";
    searchInput.dom.attributes["data-jsgui-control"] = "docs_search";
    searchInput.add_class("doc-nav__search-input");
    searchBox.add(searchInput);
    
    header.add(searchBox);
    
    // File type filters - with jsgui control marker for client hydration
    const filtersContainer = new jsgui.Control({ context: this.context, tagName: "div" });
    filtersContainer.add_class("doc-nav__filters");
    filtersContainer.dom.attributes["data-jsgui-control"] = "docs_file_filter";
    
    // .md filter checkbox
    const mdLabel = new jsgui.Control({ context: this.context, tagName: "label" });
    mdLabel.add_class("doc-nav__filter-label");
    
    const mdCheckbox = new jsgui.Control({ context: this.context, tagName: "input" });
    mdCheckbox.dom.attributes.type = "checkbox";
    if (this.filters.md) {
      mdCheckbox.dom.attributes.checked = "checked";
    }
    mdCheckbox.dom.attributes["data-filter-ext"] = "md";
    mdCheckbox.add_class("doc-nav__filter-checkbox");
    mdLabel.add(mdCheckbox);
    mdLabel.add(new StringControl({ context: this.context, text: " .md" }));
    filtersContainer.add(mdLabel);
    
    // .svg filter checkbox
    const svgLabel = new jsgui.Control({ context: this.context, tagName: "label" });
    svgLabel.add_class("doc-nav__filter-label");
    
    const svgCheckbox = new jsgui.Control({ context: this.context, tagName: "input" });
    svgCheckbox.dom.attributes.type = "checkbox";
    if (this.filters.svg) {
      svgCheckbox.dom.attributes.checked = "checked";
    }
    svgCheckbox.dom.attributes["data-filter-ext"] = "svg";
    svgCheckbox.add_class("doc-nav__filter-checkbox");
    svgLabel.add(svgCheckbox);
    svgLabel.add(new StringControl({ context: this.context, text: " .svg" }));
    filtersContainer.add(svgLabel);
    
    header.add(filtersContainer);
    this.add(header);
    
    // Column headers row (with right-click menu trigger)
    const columnHeader = this._buildColumnHeader();
    this.add(columnHeader);
    
    // Context menu for column selection (hidden by default)
    const contextMenu = this._buildColumnContextMenu();
    this.add(contextMenu);
    
    // Tree container
    const treeContainer = new jsgui.Control({ context: this.context, tagName: "div" });
    treeContainer.add_class("doc-nav__tree");
    treeContainer.dom.attributes["data-doc-tree"] = "";
    
    // Render the tree
    const rootList = this._buildTreeList(this.docTree, 0);
    treeContainer.add(rootList);
    
    this.add(treeContainer);
  }
  
  /**
   * Build the column header row with sort controls
   */
  _buildColumnHeader() {
    const headerRow = new jsgui.Control({ context: this.context, tagName: "div" });
    headerRow.add_class("doc-nav__column-header");
    headerRow.dom.attributes["data-column-header"] = "true";
    headerRow.dom.attributes["data-jsgui-control"] = "column_header"; // Enable client-side activation
    
    // Name column header (always visible)
    const nameHeader = new jsgui.Control({ context: this.context, tagName: "div" });
    nameHeader.add_class("doc-nav__col-header");
    nameHeader.add_class("doc-nav__col-header--name");
    nameHeader.add_class("doc-nav__col-header--sortable");
    if (this.sortBy === 'name') {
      nameHeader.add_class("doc-nav__col-header--active");
    }
    nameHeader.dom.attributes["data-sort-by"] = "name";
    nameHeader.dom.attributes["data-sort-order"] = this.sortBy === 'name' ? this.sortOrder : 'asc';
    nameHeader.dom.attributes.title = "Click to sort by name";
    
    const nameText = new jsgui.Control({ context: this.context, tagName: "span" });
    nameText.add(new StringControl({ context: this.context, text: "Name" }));
    nameHeader.add(nameText);
    
    // Sort indicator for name
    if (this.sortBy === 'name') {
      const sortIcon = new jsgui.Control({ context: this.context, tagName: "span" });
      sortIcon.add_class("doc-nav__sort-icon");
      sortIcon.add(new StringControl({ context: this.context, text: this.sortOrder === 'asc' ? ' ▲' : ' ▼' }));
      nameHeader.add(sortIcon);
    }
    
    headerRow.add(nameHeader);
    
    // Last Modified column header (optional)
    if (this.columns.mtime) {
      const mtimeHeader = new jsgui.Control({ context: this.context, tagName: "div" });
      mtimeHeader.add_class("doc-nav__col-header");
      mtimeHeader.add_class("doc-nav__col-header--mtime");
      mtimeHeader.add_class("doc-nav__col-header--sortable");
      if (this.sortBy === 'mtime') {
        mtimeHeader.add_class("doc-nav__col-header--active");
      }
      mtimeHeader.dom.attributes["data-sort-by"] = "mtime";
      mtimeHeader.dom.attributes["data-sort-order"] = this.sortBy === 'mtime' ? this.sortOrder : 'desc';
      mtimeHeader.dom.attributes.title = "Click to sort by date modified";
      
      const mtimeText = new jsgui.Control({ context: this.context, tagName: "span" });
      mtimeText.add(new StringControl({ context: this.context, text: "Modified" }));
      mtimeHeader.add(mtimeText);
      
      // Sort indicator for mtime
      if (this.sortBy === 'mtime') {
        const sortIcon = new jsgui.Control({ context: this.context, tagName: "span" });
        sortIcon.add_class("doc-nav__sort-icon");
        sortIcon.add(new StringControl({ context: this.context, text: this.sortOrder === 'asc' ? ' ▲' : ' ▼' }));
        mtimeHeader.add(sortIcon);
      }
      
      headerRow.add(mtimeHeader);
    }
    
    // Column options button (opens context menu)
    const optionsBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    optionsBtn.add_class("doc-nav__col-options-btn");
    optionsBtn.dom.attributes.type = "button";
    optionsBtn.dom.attributes.title = "Column options";
    optionsBtn.dom.attributes["data-action"] = "show-column-menu";
    optionsBtn.add(new StringControl({ context: this.context, text: "⋮" }));
    headerRow.add(optionsBtn);
    
    return headerRow;
  }
  
  /**
   * Build the context menu for column selection
   */
  _buildColumnContextMenu() {
    const menu = new jsgui.Control({ context: this.context, tagName: "div" });
    menu.add_class("doc-nav__context-menu");
    menu.dom.attributes["data-context-menu"] = "columns";
    menu.dom.attributes["data-jsgui-control"] = "column_context_menu"; // Enable client-side activation
    menu.dom.attributes.style = "display: none;"; // Hidden by default
    
    const menuTitle = new jsgui.Control({ context: this.context, tagName: "div" });
    menuTitle.add_class("doc-nav__context-menu-title");
    menuTitle.add(new StringControl({ context: this.context, text: "⚙️ Show Columns" })); // Gear emoji for settings
    menu.add(menuTitle);
    
    // Last Modified column toggle
    const mtimeOption = new jsgui.Control({ context: this.context, tagName: "label" });
    mtimeOption.add_class("doc-nav__context-menu-option");
    
    const mtimeCheckbox = new jsgui.Control({ context: this.context, tagName: "input" });
    mtimeCheckbox.dom.attributes.type = "checkbox";
    mtimeCheckbox.dom.attributes["data-column-toggle"] = "mtime";
    if (this.columns.mtime) {
      mtimeCheckbox.dom.attributes.checked = "checked";
    }
    mtimeOption.add(mtimeCheckbox);
    mtimeOption.add(new StringControl({ context: this.context, text: " 📅 Last Modified" })); // Calendar emoji for date
    menu.add(mtimeOption);
    
    return menu;
  }

  /**
   * Build a nested list for a set of tree nodes
   */
  _buildTreeList(nodes, depth = 0) {
    const list = new jsgui.Control({ context: this.context, tagName: "ul" });
    list.add_class("doc-nav__list");
    list.add_class(`doc-nav__list--depth-${Math.min(depth, 3)}`);
    
    for (const node of nodes) {
      // Skip filtered file types
      if (node.type === "file") {
        const ext = (node.name || "").split(".").pop().toLowerCase();
        if (ext === "md" && !this.filters.md) continue;
        if (ext === "svg" && !this.filters.svg) continue;
      }
      
      // Skip empty folders (folders with no visible children after filtering)
      if (node.type === "folder" && !this._hasVisibleChildren(node)) {
        continue;
      }
      
      const item = this._buildTreeItem(node, depth);
      list.add(item);
    }
    
    return list;
  }
  
  /**
   * Check if a folder has any visible children after filtering
   */
  _hasVisibleChildren(node) {
    if (!node.children || node.children.length === 0) return false;
    
    for (const child of node.children) {
      if (child.type === "file") {
        const ext = (child.name || "").split(".").pop().toLowerCase();
        if (ext === "md" && this.filters.md) return true;
        if (ext === "svg" && this.filters.svg) return true;
        if (ext !== "md" && ext !== "svg") return true; // Other file types always visible
      } else if (child.type === "folder") {
        if (this._hasVisibleChildren(child)) return true;
      }
    }
    return false;
  }
  
  /**
   * Build URL with current filter, column, and sort state preserved
   */
  _buildUrl(docPath) {
    const params = new URLSearchParams();
    if (docPath) {
      params.set("doc", docPath);
    }
    // Only include filter params when they differ from default (true)
    if (!this.filters.md) params.set("show_md", "0");
    if (!this.filters.svg) params.set("show_svg", "0");
    
    // Include column visibility
    if (this.columns.mtime) params.set("col_mtime", "1");
    
    // Include sort state
    if (this.sortBy !== 'name') params.set("sort_by", this.sortBy);
    if (this.sortOrder !== 'asc') params.set("sort_order", this.sortOrder);
    
    const queryString = params.toString();
    return queryString ? `${this.basePath}?${queryString}` : this.basePath;
  }

  /**
   * Build a single tree item (file or folder)
   */
  _buildTreeItem(node, depth = 0) {
    const item = new jsgui.Control({ context: this.context, tagName: "li" });
    item.add_class("doc-nav__item");
    item.add_class(`doc-nav__item--${node.type}`);
    
    // Add columns class if mtime column is visible
    if (this.columns.mtime) {
      item.add_class("doc-nav__item--with-columns");
    }
    
    // Add file extension as data attribute for CSS-based filtering
    if (node.type === "file") {
      const ext = (node.name || "").split(".").pop().toLowerCase();
      item.dom.attributes["data-file-ext"] = ext;
    }
    
    if (node.type === "folder") {
      // Folder with collapsible content
      const details = new jsgui.Control({ context: this.context, tagName: "details" });
      details.add_class("doc-nav__folder");
      
      // Auto-expand first level folders, or if selected doc is inside
      if (depth === 0 || this._containsSelected(node)) {
        details.dom.attributes.open = "open";
      }
      
      const summary = new jsgui.Control({ context: this.context, tagName: "summary" });
      summary.add_class("doc-nav__folder-summary");
      
      // Row container for folder (supports columns)
      const rowContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      rowContainer.add_class("doc-nav__row");
      
      const nameCell = new jsgui.Control({ context: this.context, tagName: "div" });
      nameCell.add_class("doc-nav__cell");
      nameCell.add_class("doc-nav__cell--name");
      
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("doc-nav__icon");
      icon.add_class("doc-nav__icon--folder");
      icon.add(new StringControl({ context: this.context, text: "📁" }));
      nameCell.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("doc-nav__label");
      label.add(new StringControl({ context: this.context, text: node.name }));
      nameCell.add(label);
      
      rowContainer.add(nameCell);
      
      // Add mtime cell if column is visible
      if (this.columns.mtime && node.mtime) {
        const mtimeCell = new jsgui.Control({ context: this.context, tagName: "div" });
        mtimeCell.add_class("doc-nav__cell");
        mtimeCell.add_class("doc-nav__cell--mtime");
        mtimeCell.add(new StringControl({ context: this.context, text: this._formatDate(node.mtime) }));
        rowContainer.add(mtimeCell);
      } else if (this.columns.mtime) {
        // Empty cell for alignment
        const mtimeCell = new jsgui.Control({ context: this.context, tagName: "div" });
        mtimeCell.add_class("doc-nav__cell");
        mtimeCell.add_class("doc-nav__cell--mtime");
        rowContainer.add(mtimeCell);
      }
      
      summary.add(rowContainer);
      details.add(summary);
      
      if (node.children && node.children.length > 0) {
        const childList = this._buildTreeList(node.children, depth + 1);
        details.add(childList);
      }
      
      item.add(details);
    } else {
      // File link
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.add_class("doc-nav__link");
      link.dom.attributes.href = this._buildUrl(node.path);
      link.dom.attributes["data-doc-path"] = node.path;
      
      if (this.selectedPath === node.path) {
        link.add_class("doc-nav__link--selected");
        link.dom.attributes["aria-current"] = "page";
      }
      
      // Row container for file (supports columns)
      const rowContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      rowContainer.add_class("doc-nav__row");
      
      const nameCell = new jsgui.Control({ context: this.context, tagName: "div" });
      nameCell.add_class("doc-nav__cell");
      nameCell.add_class("doc-nav__cell--name");
      
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("doc-nav__icon");
      icon.add_class("doc-nav__icon--file");
      icon.add(new StringControl({ context: this.context, text: this._getFileIcon(node.name) }));
      nameCell.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("doc-nav__label");
      label.add(new StringControl({ context: this.context, text: this._formatFileName(node.name) }));
      nameCell.add(label);
      
      rowContainer.add(nameCell);
      
      // Add mtime cell if column is visible
      if (this.columns.mtime && node.mtime) {
        const mtimeCell = new jsgui.Control({ context: this.context, tagName: "div" });
        mtimeCell.add_class("doc-nav__cell");
        mtimeCell.add_class("doc-nav__cell--mtime");
        mtimeCell.add(new StringControl({ context: this.context, text: this._formatDate(node.mtime) }));
        rowContainer.add(mtimeCell);
      } else if (this.columns.mtime) {
        // Empty cell for alignment
        const mtimeCell = new jsgui.Control({ context: this.context, tagName: "div" });
        mtimeCell.add_class("doc-nav__cell");
        mtimeCell.add_class("doc-nav__cell--mtime");
        rowContainer.add(mtimeCell);
      }
      
      link.add(rowContainer);
      item.add(link);
    }
    
    return item;
  }
  
  /**
   * Format an ISO date string for display
   */
  _formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      // Format as MM-DD-YY
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${month}-${day}-${year}`;
    } catch (e) {
      return '';
    }
  }

  /**
   * Check if a folder contains the selected document
   */
  _containsSelected(node) {
    if (!this.selectedPath) return false;
    
    if (node.type === "file") {
      return node.path === this.selectedPath;
    }
    
    if (node.children) {
      return node.children.some(child => this._containsSelected(child));
    }
    
    return false;
  }

  /**
   * Get an appropriate icon for a file
   */
  _getFileIcon(filename) {
    const ext = (filename || "").split(".").pop().toLowerCase();
    switch (ext) {
      case "md": return "📄";
      case "svg": return "🖼️";
      case "json": return "📋";
      case "sql": return "🗃️";
      default: return "📄";
    }
  }

  /**
   * Format filename for display (remove extension, humanize)
   */
  _formatFileName(filename) {
    // Remove .md extension for display
    let name = filename.replace(/\.md$/i, "");
    // Replace underscores/hyphens with spaces for readability
    // But keep the original if it looks like an acronym (all caps)
    if (!/^[A-Z_]+$/.test(name)) {
      // Keep it as-is for now, just remove extension
    }
    return name;
  }
}

module.exports = { DocNavControl };
