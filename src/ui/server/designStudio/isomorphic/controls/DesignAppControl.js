"use strict";

/**
 * DesignAppControl - Main application layout for Design Studio
 * 
 * Creates a resizable 2-column layout with asset navigation on the left
 * and asset viewer on the right.
 * 
 * Uses the shared ResizableSplitLayoutControl for layout.
 */

const jsgui = require("../jsgui");

const { DesignNavControl } = require("./DesignNavControl");
const { DesignViewerControl } = require("./DesignViewerControl");
const { ResizableSplitLayoutControl } = require("../../../shared/isomorphic/controls");

const StringControl = jsgui.String_Control;

class DesignAppControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.assetTree - Asset tree structure
   * @param {string} spec.selectedPath - Currently selected asset path
   * @param {Object} spec.assetContent - Asset content { title, html, svgControl, path }
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    
    this.assetTree = spec.assetTree || [];
    this.selectedPath = spec.selectedPath || null;
    this.assetContent = spec.assetContent || null;
    
    this.add_class("design-app");
    this.dom.attributes["data-jsgui-id"] = "design-app";
    
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
    navColumn.add_class("design-app__nav-column");
    navColumn.dom.attributes["data-jsgui-id"] = "nav-column";
    
    const nav = new DesignNavControl({
      context: this.context,
      assetTree: this.assetTree,
      selectedPath: this.selectedPath,
      basePath: "/"
    });
    navColumn.add(nav);
    
    // Toggle button for mobile
    const toggleBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    toggleBtn.add_class("design-app__nav-toggle");
    toggleBtn.dom.attributes.type = "button";
    toggleBtn.dom.attributes["aria-label"] = "Toggle navigation";
    toggleBtn.dom.attributes["data-jsgui-control"] = "design_nav_toggle";
    toggleBtn.add(new StringControl({ context: this.context, text: "☰" }));
    navColumn.add(toggleBtn);
    
    // Build right panel - Asset viewer
    const contentColumn = new jsgui.Control({ context: this.context, tagName: "div" });
    contentColumn.add_class("design-app__content-column");
    contentColumn.dom.attributes["data-jsgui-id"] = "content-column";
    
    const viewer = new DesignViewerControl({
      context: this.context,
      assetContent: this.assetContent
    });
    contentColumn.add(viewer);
    
    // Create resizable split layout using shared control
    const layout = new ResizableSplitLayoutControl({
      context: this.context,
      leftPanel: navColumn,
      rightPanel: contentColumn,
      initialLeftWidth: 260,
      minLeftWidth: 180,
      maxLeftWidth: 500,
      storageKey: "design-studio-nav-width"
    });
    layout.add_class("design-app__layout");
    
    this.add(layout);
  }
  
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("design-app__header");
    
    // Logo/Home link
    const logo = new jsgui.Control({ context: this.context, tagName: "a" });
    logo.add_class("design-app__logo");
    logo.dom.attributes.href = "/";
    
    const logoIcon = new jsgui.Control({ context: this.context, tagName: "span" });
    logoIcon.add_class("design-app__logo-icon");
    logoIcon.add(new StringControl({ context: this.context, text: "🎨" }));
    logo.add(logoIcon);
    
    const logoText = new jsgui.Control({ context: this.context, tagName: "span" });
    logoText.add_class("design-app__logo-text");
    logoText.add(new StringControl({ context: this.context, text: "Design Studio" }));
    logo.add(logoText);
    
    header.add(logo);
    
    // Header title showing current asset
    if (this.assetContent && this.assetContent.title) {
      const titleSep = new jsgui.Control({ context: this.context, tagName: "span" });
      titleSep.add_class("design-app__header-sep");
      titleSep.add(new StringControl({ context: this.context, text: "/" }));
      header.add(titleSep);
      
      const title = new jsgui.Control({ context: this.context, tagName: "span" });
      title.add_class("design-app__header-title");
      title.add(new StringControl({ context: this.context, text: this.assetContent.title }));
      header.add(title);
    }
    
    // Spacer
    const spacer = new jsgui.Control({ context: this.context, tagName: "div" });
    spacer.add_class("design-app__header-spacer");
    header.add(spacer);
    
    // Theme toggle
    const themeBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    themeBtn.add_class("design-app__theme-toggle");
    themeBtn.dom.attributes.type = "button";
    themeBtn.dom.attributes.title = "Toggle theme";
    themeBtn.dom.attributes["data-jsgui-control"] = "design_theme_toggle";
    themeBtn.add(new StringControl({ context: this.context, text: "🌙" }));
    header.add(themeBtn);
    
    return header;
  }
}

module.exports = { DesignAppControl };
