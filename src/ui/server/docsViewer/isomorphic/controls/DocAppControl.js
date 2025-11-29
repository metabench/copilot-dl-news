"use strict";

/**
 * DocAppControl - Main application layout control
 * 
 * Creates a resizable 2-column layout with navigation on the left
 * and document content on the right.
 */

const jsgui = require("../jsgui");

const { DocNavControl } = require("./DocNavControl");
const { DocViewerControl } = require("./DocViewerControl");
const { ResizableSplitLayoutControl } = require("../../../shared/isomorphic/controls");

const StringControl = jsgui.String_Control;

/**
 * Main application control with resizable 2-column layout
 */
class DocAppControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.docTree - Documentation tree structure
   * @param {string} spec.selectedPath - Currently selected document path
   * @param {Object} spec.docContent - Document content { title, html, path }
   * @param {Object} spec.filters - File type filters { md: boolean, svg: boolean }
   * @param {Object} spec.columns - Column visibility { mtime: boolean }
   * @param {string} spec.sortBy - Sort field ('name' or 'mtime')
   * @param {string} spec.sortOrder - Sort order ('asc' or 'desc')
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    
    this.docTree = spec.docTree || [];
    this.selectedPath = spec.selectedPath || null;
    this.docContent = spec.docContent || null;
    this.filters = spec.filters || { md: true, svg: true };
    this.columns = spec.columns || { mtime: false };
    this.sortBy = spec.sortBy || 'name';
    this.sortOrder = spec.sortOrder || 'asc';
    
    this.add_class("doc-app");
    this.dom.attributes["data-jsgui-id"] = "doc-app";
    
    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    // App header
    const header = this._buildHeader();
    this.add(header);
    
    // Build left panel - Navigation
    const navColumn = new jsgui.Control({ context: this.context, tagName: "aside" });
    navColumn.add_class("doc-app__nav-column");
    navColumn.dom.attributes["data-jsgui-id"] = "nav-column";
    
    const nav = new DocNavControl({
      context: this.context,
      docTree: this.docTree,
      selectedPath: this.selectedPath,
      basePath: "/",
      filters: this.filters,
      columns: this.columns,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder
    });
    navColumn.add(nav);
    
    // Toggle button for mobile - with jsgui control marker for client hydration
    const toggleBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    toggleBtn.add_class("doc-app__nav-toggle");
    toggleBtn.dom.attributes.type = "button";
    toggleBtn.dom.attributes["aria-label"] = "Toggle navigation";
    toggleBtn.dom.attributes["data-jsgui-control"] = "docs_nav_toggle";
    toggleBtn.add(new StringControl({ context: this.context, text: "☰" }));
    navColumn.add(toggleBtn);
    
    // Build right panel - Content viewer
    const contentColumn = new jsgui.Control({ context: this.context, tagName: "div" });
    contentColumn.add_class("doc-app__content-column");
    contentColumn.dom.attributes["data-jsgui-id"] = "content-column";
    
    const viewer = new DocViewerControl({
      context: this.context,
      docContent: this.docContent
    });
    contentColumn.add(viewer);
    
    // Create resizable split layout
    const layout = new ResizableSplitLayoutControl({
      context: this.context,
      leftPanel: navColumn,
      rightPanel: contentColumn,
      initialLeftWidth: 280,
      minLeftWidth: 180,
      maxLeftWidth: 600,
      storageKey: "docs-viewer-nav-width"
    });
    layout.add_class("doc-app__layout");
    
    this.add(layout);
  }

  /**
   * Build the application header
   */
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("doc-app__header");
    
    // Logo/Home link
    const logo = new jsgui.Control({ context: this.context, tagName: "a" });
    logo.add_class("doc-app__logo");
    logo.dom.attributes.href = "/";
    
    const logoIcon = new jsgui.Control({ context: this.context, tagName: "span" });
    logoIcon.add_class("doc-app__logo-icon");
    logoIcon.add(new StringControl({ context: this.context, text: "📚" }));
    logo.add(logoIcon);
    
    const logoText = new jsgui.Control({ context: this.context, tagName: "span" });
    logoText.add_class("doc-app__logo-text");
    logoText.add(new StringControl({ context: this.context, text: "Docs" }));
    logo.add(logoText);
    
    header.add(logo);
    
    // Header title showing current doc
    if (this.docContent && this.docContent.title) {
      const titleSep = new jsgui.Control({ context: this.context, tagName: "span" });
      titleSep.add_class("doc-app__header-sep");
      titleSep.add(new StringControl({ context: this.context, text: "/" }));
      header.add(titleSep);
      
      const title = new jsgui.Control({ context: this.context, tagName: "span" });
      title.add_class("doc-app__header-title");
      title.add(new StringControl({ context: this.context, text: this.docContent.title }));
      header.add(title);
    }
    
    // Spacer
    const spacer = new jsgui.Control({ context: this.context, tagName: "div" });
    spacer.add_class("doc-app__header-spacer");
    header.add(spacer);
    
    // Theme toggle - with jsgui control marker for client hydration
    const themeBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    themeBtn.add_class("doc-app__theme-toggle");
    themeBtn.dom.attributes.type = "button";
    themeBtn.dom.attributes.title = "Toggle theme";
    themeBtn.dom.attributes["data-jsgui-control"] = "docs_theme_toggle";
    themeBtn.add(new StringControl({ context: this.context, text: "🌙" }));
    header.add(themeBtn);
    
    return header;
  }
}

module.exports = { DocAppControl };
