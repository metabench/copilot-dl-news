"use strict";

/**
 * DocNavControl - Navigation tree for documentation
 * 
 * Renders a collapsible tree of documentation files and folders
 * in the left column of the docs viewer.
 */

const jsgui = require("jsgui3-html");

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
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "nav" });
    
    this.docTree = spec.docTree || [];
    this.selectedPath = spec.selectedPath || null;
    this.basePath = spec.basePath || "/";
    this.filters = spec.filters || { md: true, svg: true };
    
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
   * Build URL with current filter state preserved
   */
  _buildUrl(docPath) {
    const params = new URLSearchParams();
    if (docPath) {
      params.set("doc", docPath);
    }
    // Only include filter params when they differ from default (true)
    if (!this.filters.md) params.set("show_md", "0");
    if (!this.filters.svg) params.set("show_svg", "0");
    
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
      
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("doc-nav__icon");
      icon.add_class("doc-nav__icon--folder");
      icon.add(new StringControl({ context: this.context, text: "📁" }));
      summary.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("doc-nav__label");
      label.add(new StringControl({ context: this.context, text: node.name }));
      summary.add(label);
      
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
      
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("doc-nav__icon");
      icon.add_class("doc-nav__icon--file");
      icon.add(new StringControl({ context: this.context, text: this._getFileIcon(node.name) }));
      link.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("doc-nav__label");
      label.add(new StringControl({ context: this.context, text: this._formatFileName(node.name) }));
      link.add(label);
      
      item.add(link);
    }
    
    return item;
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
