"use strict";

/**
 * BaseAppControl - Base class for app-level controls
 * 
 * Provides common structure for UI servers:
 * - Header with navigation
 * - Main content area
 * - Footer with metadata
 * 
 * All UI servers (Data Explorer, Diagram Atlas, Gazetteer) extend this.
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Base control for app-level shells
 * 
 * Usage:
 * ```js
 * class MyAppControl extends BaseAppControl {
 *   constructor(spec) {
 *     super({ ...spec, appName: "My App", appClass: "my-app" });
 *     // Set your properties here
 *     this.myProp = spec.myProp;
 *     // Then call compose
 *     if (!spec.el) {
 *       this.compose();
 *     }
 *   }
 * 
 *   composeMainContent() {
 *     // Override to add your main content
 *     const view = new MyViewControl({ context: this.context, ...this.props });
 *     this.mainContainer.add(view);
 *   }
 * }
 * ```
 * 
 * NOTE: Subclasses MUST call this.compose() at the end of their constructor.
 * The base class does not auto-compose because subclass properties may not
 * be set yet when composeMainContent() is called.
 */
class BaseAppControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {string} spec.appName - Display name for the app
   * @param {string} spec.appClass - CSS class prefix for the app
   * @param {string} spec.title - Page title (optional, defaults to appName)
   * @param {Array} spec.navLinks - Navigation links [{ key, href, label, active }]
   * @param {Object} spec.meta - Metadata for footer { dbLabel, generatedAt, ... }
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    
    this.appName = spec.appName || "Application";
    this.appClass = spec.appClass || "app";
    this.title = spec.title || this.appName;
    this.navLinks = spec.navLinks || [];
    this.meta = spec.meta || {};
    this.subtitle = spec.subtitle || null;
    
    // Store additional props for subclasses
    this.props = spec;
    
    // Container references for subclass composition
    this.headerContainer = null;
    this.mainContainer = null;
    this.footerContainer = null;
    
    this.add_class(this.appClass);
    this.dom.attributes["data-jsgui-id"] = this.appClass;
    
    // NOTE: Do NOT call compose() here - subclasses must call it
    // after setting their properties
  }

  /**
   * Build the complete page structure
   * Subclasses should override composeMainContent() rather than this
   */
  compose() {
    // Header with nav
    this.headerContainer = this._buildHeader();
    this.add(this.headerContainer);
    
    // Main content area
    this.mainContainer = new jsgui.Control({ context: this.context, tagName: "main" });
    this.mainContainer.add_class(`${this.appClass}__main`);
    this.mainContainer.dom.attributes["role"] = "main";
    this.composeMainContent();
    this.add(this.mainContainer);
    
    // Footer
    this.footerContainer = this._buildFooter();
    this.add(this.footerContainer);
  }

  /**
   * Override in subclasses to add main content
   */
  composeMainContent() {
    // Default: empty main content
    const placeholder = new jsgui.Control({ context: this.context, tagName: "p" });
    placeholder.add(new StringControl({ context: this.context, text: "No content configured" }));
    this.mainContainer.add(placeholder);
  }

  /**
   * Build the header section with navigation
   * @returns {Control} Header control
   */
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class(`${this.appClass}__header`);
    
    // App title
    const titleEl = new jsgui.Control({ context: this.context, tagName: "h1" });
    titleEl.add_class(`${this.appClass}__title`);
    titleEl.add(new StringControl({ context: this.context, text: this.title }));
    header.add(titleEl);
    
    // Subtitle if present
    if (this.subtitle) {
      const subtitleEl = new jsgui.Control({ context: this.context, tagName: "p" });
      subtitleEl.add_class(`${this.appClass}__subtitle`);
      subtitleEl.add(new StringControl({ context: this.context, text: this.subtitle }));
      header.add(subtitleEl);
    }
    
    // Navigation if links provided
    if (this.navLinks && this.navLinks.length > 0) {
      const nav = this._buildNav();
      header.add(nav);
    }
    
    return header;
  }

  /**
   * Build navigation from navLinks
   * @returns {Control} Nav control
   */
  _buildNav() {
    const nav = new jsgui.Control({ context: this.context, tagName: "nav" });
    nav.add_class(`${this.appClass}__nav`);
    nav.dom.attributes["aria-label"] = "Main navigation";
    
    const ul = new jsgui.Control({ context: this.context, tagName: "ul" });
    ul.add_class(`${this.appClass}__nav-list`);
    
    for (const link of this.navLinks) {
      const li = new jsgui.Control({ context: this.context, tagName: "li" });
      li.add_class(`${this.appClass}__nav-item`);
      
      if (link.active) {
        li.add_class(`${this.appClass}__nav-item--active`);
      }
      
      const a = new jsgui.Control({ context: this.context, tagName: "a" });
      a.add_class(`${this.appClass}__nav-link`);
      a.dom.attributes.href = link.href || "#";
      
      if (link.active) {
        a.dom.attributes["aria-current"] = "page";
      }
      
      a.add(new StringControl({ context: this.context, text: link.label || link.key }));
      li.add(a);
      ul.add(li);
    }
    
    nav.add(ul);
    return nav;
  }

  /**
   * Build the footer section with metadata
   * @returns {Control} Footer control
   */
  _buildFooter() {
    const footer = new jsgui.Control({ context: this.context, tagName: "footer" });
    footer.add_class(`${this.appClass}__footer`);
    
    const metaItems = [];
    
    if (this.meta.dbLabel) {
      metaItems.push(`📁 ${this.meta.dbLabel}`);
    }
    
    if (this.meta.generatedAt) {
      metaItems.push(`🕒 ${this.meta.generatedAt}`);
    }
    
    if (this.meta.rowCount !== undefined) {
      metaItems.push(`📊 ${this.meta.rowCount.toLocaleString()} rows`);
    }
    
    if (metaItems.length > 0) {
      const metaText = metaItems.join(" • ");
      const span = new jsgui.Control({ context: this.context, tagName: "span" });
      span.add_class(`${this.appClass}__meta`);
      span.add(new StringControl({ context: this.context, text: metaText }));
      footer.add(span);
    }
    
    return footer;
  }

  /**
   * Create a section wrapper with optional title
   * @param {string} sectionClass - CSS class for the section
   * @param {string} title - Optional section title
   * @returns {Control} Section control
   */
  createSection(sectionClass, title = null) {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class(`${this.appClass}__section`);
    if (sectionClass) {
      section.add_class(sectionClass);
    }
    
    if (title) {
      const h2 = new jsgui.Control({ context: this.context, tagName: "h2" });
      h2.add_class(`${this.appClass}__section-title`);
      h2.add(new StringControl({ context: this.context, text: title }));
      section.add(h2);
    }
    
    return section;
  }
}

module.exports = { BaseAppControl };
