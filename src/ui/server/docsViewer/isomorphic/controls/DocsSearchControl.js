"use strict";

/**
 * DocsSearchControl - Client-side documentation search/filter
 * 
 * A jsgui3 control that provides real-time filtering of the
 * documentation navigation tree.
 */

const jsgui = require("../jsgui");

class DocsSearchControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "input" });
    
    this.__type_name = "docs_search";
    
    this.add_class("doc-nav__search-input");
    this.dom.attributes.type = "text";
    this.dom.attributes.placeholder = "Search docs...";
    this.dom.attributes["data-jsgui-control"] = "docs_search";
    
    // Input controls don't have children to compose
  }
  
  /**
   * Client-side activation
   */
  activate() {
    if (this.__active) return;
    
    if (typeof super.activate === "function") {
      super.activate();
    }
    
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Find navigation items to filter
    this.navTree = document.querySelector(".doc-nav__tree");
    
    // Debounce timer
    let debounceTimer = null;
    
    // Bind input handler with debounce
    el.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = setTimeout(() => {
        this.filterNavigation(query);
      }, 150);
    });
    
    // Clear on escape
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el.value = "";
        this.filterNavigation("");
      }
    });
    
    console.log("[DocsSearch] Activated");
  }
  
  /**
   * Filter navigation items based on search query
   */
  filterNavigation(query) {
    if (!this.navTree) return;
    
    const items = this.navTree.querySelectorAll(".doc-nav__item");
    
    if (!query) {
      // Show all items when query is empty
      items.forEach(item => {
        item.style.display = "";
      });
      
      // Collapse folders back to default state
      const folders = this.navTree.querySelectorAll(".doc-nav__folder");
      folders.forEach((folder, index) => {
        // Keep top-level folders open
        const depth = folder.closest(".doc-nav__list--depth-0") ? 0 : 1;
        folder.open = depth === 0;
      });
      
      return;
    }
    
    // Filter items
    let hasMatches = false;
    
    items.forEach(item => {
      const label = item.querySelector(".doc-nav__label");
      const text = label?.textContent?.toLowerCase() || "";
      
      if (text.includes(query)) {
        item.style.display = "";
        hasMatches = true;
        
        // Expand parent folders
        let parent = item.parentElement;
        while (parent) {
          if (parent.tagName === "DETAILS") {
            parent.open = true;
          }
          parent = parent.parentElement;
        }
      } else {
        // Check if this is a folder that might have matching children
        const folder = item.querySelector(".doc-nav__folder");
        if (folder) {
          const hasMatchingChildren = Array.from(
            folder.querySelectorAll(".doc-nav__label")
          ).some(l => l.textContent?.toLowerCase().includes(query));
          
          if (hasMatchingChildren) {
            item.style.display = "";
            folder.open = true;
            hasMatches = true;
          } else {
            item.style.display = "none";
          }
        } else {
          item.style.display = "none";
        }
      }
    });
    
    this.raise("filter", { query, hasMatches });
  }
}

DocsSearchControl.prototype.__type_name = "docs_search";

module.exports = { DocsSearchControl };
