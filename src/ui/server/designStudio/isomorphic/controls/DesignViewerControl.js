"use strict";

/**
 * DesignViewerControl - Displays design assets (SVG primarily)
 * 
 * Works on both server (SSR) and client (activation).
 */

const jsgui = require("../jsgui");

const StringControl = jsgui.String_Control;

class DesignViewerControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.assetContent - Asset content { path, title, html, svgControl }
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "main" });
    
    this.assetContent = spec.assetContent || null;
    
    this.add_class("design-viewer");
    this.dom.attributes["data-jsgui-control"] = "design_viewer";
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    if (!this.assetContent) {
      this._buildWelcome();
    } else {
      this._buildContent();
    }
  }
  
  _buildWelcome() {
    const welcome = new jsgui.Control({ context: this.context, tagName: "div" });
    welcome.add_class("design-viewer__welcome");
    
    const icon = new jsgui.Control({ context: this.context, tagName: "div" });
    icon.add_class("design-viewer__welcome-icon");
    icon.add(new StringControl({ context: this.context, text: "🎨" }));
    welcome.add(icon);
    
    const title = new jsgui.Control({ context: this.context, tagName: "h1" });
    title.add_class("design-viewer__welcome-title");
    title.add(new StringControl({ context: this.context, text: "Design Studio" }));
    welcome.add(title);
    
    const message = new jsgui.Control({ context: this.context, tagName: "p" });
    message.add_class("design-viewer__welcome-message");
    message.add(new StringControl({ 
      context: this.context, 
      text: "Select a design asset from the navigation to view it here." 
    }));
    welcome.add(message);
    
    const tip = new jsgui.Control({ context: this.context, tagName: "p" });
    tip.add_class("design-viewer__welcome-tip");
    tip.add(new StringControl({ 
      context: this.context, 
      text: "Browse SVG diagrams, wireframes, and design artifacts." 
    }));
    welcome.add(tip);
    
    this.add(welcome);
  }
  
  _buildContent() {
    const asset = this.assetContent;
    
    // Header with breadcrumb and title
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("design-viewer__header");
    
    // Breadcrumb
    if (asset.path) {
      const breadcrumb = this._buildBreadcrumb(asset.path);
      header.add(breadcrumb);
    }
    
    // Title
    const title = new jsgui.Control({ context: this.context, tagName: "h1" });
    title.add_class("design-viewer__title");
    title.add(new StringControl({ context: this.context, text: asset.title || "Untitled" }));
    header.add(title);
    
    // Toolbar
    const toolbar = new jsgui.Control({ context: this.context, tagName: "div" });
    toolbar.add_class("design-viewer__toolbar");
    
    const zoomInBtn = this._buildToolbarButton("🔍+", "Zoom in", "design_zoom_in");
    const zoomOutBtn = this._buildToolbarButton("🔍-", "Zoom out", "design_zoom_out");
    const resetBtn = this._buildToolbarButton("↩️", "Reset view", "design_reset");
    const downloadBtn = this._buildToolbarButton("💾", "Download", "design_download");
    
    toolbar.add(zoomInBtn);
    toolbar.add(zoomOutBtn);
    toolbar.add(resetBtn);
    toolbar.add(downloadBtn);
    
    header.add(toolbar);
    this.add(header);
    
    // Content area - display the asset
    const content = new jsgui.Control({ context: this.context, tagName: "div" });
    content.add_class("design-viewer__content");
    
    // If we have an SVG control (jsgui3 rendered), add it
    if (asset.svgControl) {
      const svgContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      svgContainer.add_class("design-svg-container");
      svgContainer.dom.attributes["data-jsgui-id"] = "svg-viewport";
      
      const svgWrapper = new jsgui.Control({ context: this.context, tagName: "div" });
      svgWrapper.add_class("design-svg-wrapper");
      svgWrapper.add(asset.svgControl);
      
      svgContainer.add(svgWrapper);
      content.add(svgContainer);
    } else if (asset.html) {
      // HTML content (fallback)
      const htmlContainer = new jsgui.Control({ context: this.context, tagName: "div" });
      htmlContainer.add_class("design-content");
      htmlContainer.dom.attributes["data-jsgui-id"] = "design-content";
      
      // For HTML, we need a Raw_HTML control to embed it
      const rawHtml = new jsgui.Raw_HTML({ context: this.context, html: asset.html });
      htmlContainer.add(rawHtml);
      
      content.add(htmlContainer);
    }
    
    this.add(content);
    
    // Footer with file info
    const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
    footer.add_class("design-viewer__footer");
    
    const pathInfo = new jsgui.Control({ context: this.context, tagName: "p" });
    pathInfo.add_class("design-viewer__path-info");
    pathInfo.add(new StringControl({ context: this.context, text: `File: ${asset.path}` }));
    footer.add(pathInfo);
    
    this.add(footer);
  }
  
  _buildBreadcrumb(filePath) {
    const nav = new jsgui.Control({ context: this.context, tagName: "nav" });
    nav.add_class("design-viewer__breadcrumb");
    nav.dom.attributes["aria-label"] = "Breadcrumb";
    
    const list = new jsgui.Control({ context: this.context, tagName: "ol" });
    list.add_class("design-viewer__breadcrumb-list");
    
    // Home
    const homeItem = new jsgui.Control({ context: this.context, tagName: "li" });
    homeItem.add_class("design-viewer__breadcrumb-item");
    const homeLink = new jsgui.Control({ context: this.context, tagName: "a" });
    homeLink.dom.attributes.href = "/";
    homeLink.add(new StringControl({ context: this.context, text: "🏠 Design" }));
    homeItem.add(homeLink);
    list.add(homeItem);
    
    // Path segments
    const parts = filePath.split("/").filter(Boolean);
    let currentPath = "";
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath += "/" + part;
      
      const item = new jsgui.Control({ context: this.context, tagName: "li" });
      item.add_class("design-viewer__breadcrumb-item");
      
      if (i === parts.length - 1) {
        // Current item - not a link
        item.add(new StringControl({ context: this.context, text: part }));
      } else {
        // Directory link
        const link = new jsgui.Control({ context: this.context, tagName: "a" });
        link.dom.attributes.href = `/?asset=${encodeURIComponent(currentPath)}`;
        link.add(new StringControl({ context: this.context, text: part }));
        item.add(link);
      }
      
      list.add(item);
    }
    
    nav.add(list);
    return nav;
  }
  
  _buildToolbarButton(icon, title, controlId) {
    const btn = new jsgui.Control({ context: this.context, tagName: "button" });
    btn.add_class("design-viewer__toolbar-btn");
    btn.dom.attributes.type = "button";
    btn.dom.attributes.title = title;
    btn.dom.attributes["data-jsgui-control"] = controlId;
    btn.add(new StringControl({ context: this.context, text: icon }));
    return btn;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Set up zoom controls
    this._setupToolbar(el);
    
    console.log("[DesignViewerControl] Activated");
  }
  
  _setupToolbar(el) {
    let scale = 1;
    const minScale = 0.25;
    const maxScale = 4;
    const step = 0.25;
    
    const svgWrapper = el.querySelector(".design-svg-wrapper");
    if (!svgWrapper) return;
    
    const zoomIn = el.querySelector("[data-jsgui-control='design_zoom_in']");
    const zoomOut = el.querySelector("[data-jsgui-control='design_zoom_out']");
    const reset = el.querySelector("[data-jsgui-control='design_reset']");
    const download = el.querySelector("[data-jsgui-control='design_download']");
    
    const applyZoom = () => {
      svgWrapper.style.transform = `scale(${scale})`;
      svgWrapper.style.transformOrigin = "top left";
    };
    
    if (zoomIn) {
      zoomIn.addEventListener("click", () => {
        scale = Math.min(maxScale, scale + step);
        applyZoom();
      });
    }
    
    if (zoomOut) {
      zoomOut.addEventListener("click", () => {
        scale = Math.max(minScale, scale - step);
        applyZoom();
      });
    }
    
    if (reset) {
      reset.addEventListener("click", () => {
        scale = 1;
        applyZoom();
      });
    }
    
    if (download) {
      download.addEventListener("click", () => {
        const svg = svgWrapper.querySelector("svg");
        if (!svg) return;
        
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const blob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = "design-asset.svg";
        a.click();
        
        URL.revokeObjectURL(url);
      });
    }
  }
}

module.exports = { DesignViewerControl };
