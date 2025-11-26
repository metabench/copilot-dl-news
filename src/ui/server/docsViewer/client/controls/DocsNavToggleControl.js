"use strict";

/**
 * DocsNavToggleControl - Client-side mobile navigation toggle
 * 
 * A jsgui3 control that handles showing/hiding the navigation panel
 * on mobile devices.
 */

const jsgui = require("jsgui3-client");

class DocsNavToggleControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "button" });
    
    this.isNavOpen = false;
    
    // Set type name for jsgui activation lookup
    this.__type_name = "docs_nav_toggle";
    
    this.add_class("doc-app__nav-toggle");
    this.dom.attributes.type = "button";
    this.dom.attributes["aria-label"] = "Toggle navigation";
    this.dom.attributes["data-jsgui-control"] = "docs_nav_toggle";
    
    // Only compose if not hydrating existing DOM
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    const StringControl = jsgui.String_Control;
    this.add(new StringControl({ context: this.context, text: "☰" }));
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
    
    // Find the nav column to toggle
    this.navColumn = document.querySelector(".doc-app__nav-column");
    
    // Bind click handler
    el.addEventListener("click", (e) => {
      e.preventDefault();
      this.toggleNav();
    });
    
    console.log("[DocsNavToggle] Activated");
  }
  
  /**
   * Toggle navigation visibility
   */
  toggleNav() {
    this.isNavOpen = !this.isNavOpen;
    
    if (this.navColumn) {
      this.navColumn.classList.toggle("is-open", this.isNavOpen);
    }
    
    // Update button icon
    const el = this.dom?.el;
    if (el) {
      el.textContent = this.isNavOpen ? "✕" : "☰";
      el.setAttribute("aria-expanded", String(this.isNavOpen));
    }
    
    this.raise("change", { open: this.isNavOpen });
  }
}

DocsNavToggleControl.prototype.__type_name = "docs_nav_toggle";

module.exports = { DocsNavToggleControl };
