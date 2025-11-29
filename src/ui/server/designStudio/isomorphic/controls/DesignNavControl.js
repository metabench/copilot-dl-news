"use strict";

/**
 * DesignNavControl - Navigation tree for design assets
 * 
 * Similar to DocNavControl, but simplified for a design-focused experience.
 * Works on both server (SSR) and client (activation).
 */

const jsgui = require("../jsgui");

const StringControl = jsgui.String_Control;

class DesignNavControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.assetTree - Tree of design assets { name, path, type, children }
   * @param {string} spec.selectedPath - Currently selected asset path
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "nav" });
    
    this.assetTree = spec.assetTree || [];
    this.selectedPath = spec.selectedPath || null;
    this.basePath = spec.basePath || "/";
    
    this.add_class("design-nav");
    this.dom.attributes["data-jsgui-control"] = "design_nav";
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    // Header with title and search
    const header = this._buildHeader();
    this.add(header);
    
    // Asset tree
    const treeContainer = new jsgui.Control({ context: this.context, tagName: "div" });
    treeContainer.add_class("design-nav__tree");
    treeContainer.dom.attributes["data-jsgui-id"] = "design-nav-tree";
    
    const tree = this._buildTree(this.assetTree, 0);
    treeContainer.add(tree);
    
    this.add(treeContainer);
  }
  
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "div" });
    header.add_class("design-nav__header");
    
    const title = new jsgui.Control({ context: this.context, tagName: "div" });
    title.add_class("design-nav__title");
    title.add(new StringControl({ context: this.context, text: "Design Assets" }));
    header.add(title);
    
    // Search box
    const search = new jsgui.Control({ context: this.context, tagName: "div" });
    search.add_class("design-nav__search");
    
    const searchIcon = new jsgui.Control({ context: this.context, tagName: "span" });
    searchIcon.add_class("design-nav__search-icon");
    searchIcon.add(new StringControl({ context: this.context, text: "🔍" }));
    search.add(searchIcon);
    
    const searchInput = new jsgui.Control({ context: this.context, tagName: "input" });
    searchInput.add_class("design-nav__search-input");
    searchInput.dom.attributes.type = "text";
    searchInput.dom.attributes.placeholder = "Search assets...";
    searchInput.dom.attributes["data-jsgui-control"] = "design_search";
    search.add(searchInput);
    
    header.add(search);
    
    return header;
  }
  
  _buildTree(nodes, depth) {
    const list = new jsgui.Control({ context: this.context, tagName: "ul" });
    list.add_class("design-nav__list");
    if (depth > 0) {
      list.add_class(`design-nav__list--depth-${depth}`);
    }
    
    for (const node of nodes) {
      const item = this._buildNode(node, depth);
      list.add(item);
    }
    
    return list;
  }
  
  _buildNode(node, depth) {
    const item = new jsgui.Control({ context: this.context, tagName: "li" });
    item.add_class("design-nav__item");
    
    if (node.type === "folder" && node.children && node.children.length > 0) {
      // Folder with children - use details/summary
      const folder = new jsgui.Control({ context: this.context, tagName: "details" });
      folder.add_class("design-nav__folder");
      folder.dom.attributes.open = ""; // Open by default (design folder is small)
      
      const summary = new jsgui.Control({ context: this.context, tagName: "summary" });
      summary.add_class("design-nav__folder-summary");
      
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("design-nav__icon");
      icon.add(new StringControl({ context: this.context, text: "📁" }));
      summary.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("design-nav__label");
      label.add(new StringControl({ context: this.context, text: node.name }));
      summary.add(label);
      
      folder.add(summary);
      
      const childTree = this._buildTree(node.children, depth + 1);
      folder.add(childTree);
      
      item.add(folder);
    } else if (node.type === "file") {
      // File link
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.add_class("design-nav__link");
      
      const isSelected = node.path === this.selectedPath;
      if (isSelected) {
        link.add_class("design-nav__link--selected");
      }
      
      // Build URL
      const docParam = encodeURIComponent(node.path);
      link.dom.attributes.href = `${this.basePath}?asset=${docParam}`;
      
      // Icon based on file extension
      const icon = new jsgui.Control({ context: this.context, tagName: "span" });
      icon.add_class("design-nav__icon");
      const iconText = this._getFileIcon(node.name);
      icon.add(new StringControl({ context: this.context, text: iconText }));
      link.add(icon);
      
      const label = new jsgui.Control({ context: this.context, tagName: "span" });
      label.add_class("design-nav__label");
      label.add(new StringControl({ context: this.context, text: node.name }));
      link.add(label);
      
      item.add(link);
    }
    
    return item;
  }
  
  _getFileIcon(filename) {
    const ext = (filename.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
    switch (ext) {
      case "svg": return "🖼️";
      case "png": 
      case "jpg": 
      case "jpeg": 
      case "gif": 
      case "webp": return "🌄";
      case "pdf": return "📑";
      case "ai": 
      case "psd": 
      case "xd": 
      case "fig": return "🎨";
      default: return "📄";
    }
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Set up search filtering
    const searchInput = el.querySelector("[data-jsgui-control='design_search']");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this._filterTree(e.target.value);
      });
    }
    
    console.log("[DesignNavControl] Activated");
  }
  
  _filterTree(query) {
    const el = this.dom?.el;
    if (!el) return;
    
    const tree = el.querySelector(".design-nav__tree");
    if (!tree) return;
    
    const normalizedQuery = query.toLowerCase().trim();
    const links = tree.querySelectorAll(".design-nav__link");
    
    for (const link of links) {
      const label = link.querySelector(".design-nav__label");
      const text = label?.textContent?.toLowerCase() || "";
      
      if (!normalizedQuery || text.includes(normalizedQuery)) {
        link.closest(".design-nav__item").style.display = "";
      } else {
        link.closest(".design-nav__item").style.display = "none";
      }
    }
    
    // Also show parent folders if any children are visible
    const folders = tree.querySelectorAll(".design-nav__folder");
    for (const folder of folders) {
      const visibleChildren = folder.querySelectorAll(".design-nav__item:not([style*='display: none'])");
      const summary = folder.querySelector(".design-nav__folder-summary");
      if (visibleChildren.length === 0) {
        folder.style.display = "none";
      } else {
        folder.style.display = "";
        folder.open = true;
      }
    }
  }
}

module.exports = { DesignNavControl };
