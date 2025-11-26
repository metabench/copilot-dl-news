"use strict";

/**
 * DocsThemeToggleControl - Client-side theme toggle control
 * 
 * A jsgui3 control that handles theme switching (dark/light mode).
 * This control activates on the client to bind click events.
 */

const jsgui = require("jsgui3-client");

class DocsThemeToggleControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {string} spec.initialTheme - Initial theme ("light" or "dark")
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "button" });
    
    this.currentTheme = spec.initialTheme || "light";
    
    // Set type name for jsgui activation lookup
    this.__type_name = "docs_theme_toggle";
    
    this.add_class("doc-app__theme-toggle");
    this.dom.attributes.type = "button";
    this.dom.attributes.title = "Toggle theme";
    this.dom.attributes["data-jsgui-control"] = "docs_theme_toggle";
    
    // Only compose if not hydrating existing DOM
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    const icon = this.currentTheme === "dark" ? "☀️" : "🌙";
    const StringControl = jsgui.String_Control;
    this.add(new StringControl({ context: this.context, text: icon }));
  }
  
  /**
   * Client-side activation - called when jsgui.activate() runs
   */
  activate() {
    if (this.__active) return;
    
    // Call parent activate
    if (typeof super.activate === "function") {
      super.activate();
    }
    
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) {
      console.warn("[DocsThemeToggle] No DOM element for activation");
      return;
    }
    
    // Load saved theme preference
    this._loadSavedTheme();
    
    // Bind click handler
    el.addEventListener("click", (e) => {
      e.preventDefault();
      this.toggleTheme();
    });
    
    console.log("[DocsThemeToggle] Activated with theme:", this.currentTheme);
  }
  
  /**
   * Load theme from localStorage
   */
  _loadSavedTheme() {
    if (typeof localStorage === "undefined") return;
    
    try {
      const saved = localStorage.getItem("docs-viewer-theme");
      if (saved === "dark" || saved === "light") {
        this.currentTheme = saved;
        this._applyTheme();
      } else {
        // Check system preference
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
        this.currentTheme = prefersDark ? "dark" : "light";
        this._applyTheme();
      }
    } catch (err) {
      // Ignore localStorage errors
    }
  }
  
  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    this.currentTheme = this.currentTheme === "dark" ? "light" : "dark";
    this._applyTheme();
    this._saveTheme();
    this._updateIcon();
    
    // Raise change event
    this.raise("change", { theme: this.currentTheme });
  }
  
  /**
   * Apply the current theme to the document
   */
  _applyTheme() {
    if (typeof document === "undefined") return;
    
    document.documentElement.setAttribute("data-theme", this.currentTheme);
  }
  
  /**
   * Save theme preference to localStorage
   */
  _saveTheme() {
    if (typeof localStorage === "undefined") return;
    
    try {
      localStorage.setItem("docs-viewer-theme", this.currentTheme);
    } catch (err) {
      // Ignore localStorage errors
    }
  }
  
  /**
   * Update the button icon
   */
  _updateIcon() {
    const el = this.dom?.el;
    if (!el) return;
    
    el.textContent = this.currentTheme === "dark" ? "☀️" : "🌙";
  }
}

// Set static type name for control lookup
DocsThemeToggleControl.prototype.__type_name = "docs_theme_toggle";

module.exports = { DocsThemeToggleControl };
