"use strict";

/**
 * GazetteerBreadcrumbControl - Breadcrumb navigation for the Gazetteer
 * 
 * Displays a breadcrumb trail showing:
 * - Home link
 * - Parent places (reversed to show hierarchy)
 * - Current place name
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Breadcrumb navigation control
 * 
 * @example
 * const breadcrumb = new GazetteerBreadcrumbControl({
 *   context,
 *   currentName: "London",
 *   parents: [
 *     { parent_id: 1, name: "England" },
 *     { parent_id: 2, name: "United Kingdom" }
 *   ]
 * });
 */
class GazetteerBreadcrumbControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} spec.currentName - Name of the current place
   * @param {Array} [spec.parents] - Array of parent places { parent_id, name }
   * @param {string} [spec.homeText] - Text for home link (default: "🌐 Home")
   * @param {string} [spec.homeHref] - URL for home link (default: "/")
   * @param {string} [spec.separator] - Separator between items (default: " › ")
   * @param {string} [spec.basePath] - Base path for place links (default: "/place/")
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "nav",
      __type_name: "gazetteer_breadcrumb"
    });
    
    this.add_class("gazetteer__breadcrumb");
    
    // Breadcrumb state
    this.currentName = spec.currentName || "";
    this.parents = spec.parents || [];
    this.homeText = spec.homeText || "🌐 Home";
    this.homeHref = spec.homeHref || "/";
    this.separator = spec.separator || " › ";
    this.basePath = spec.basePath || "/place/";
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the breadcrumb trail
   */
  compose() {
    // Home link
    const home = new jsgui.Control({ context: this.context, tagName: "a" });
    home.dom.attributes.href = this.homeHref;
    home.add(new StringControl({ context: this.context, text: this.homeText }));
    this.add(home);
    
    // Parents (reversed to show top-level first)
    const sorted = [...this.parents].reverse();
    for (const parent of sorted) {
      this.add(new StringControl({ context: this.context, text: this.separator }));
      
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.dom.attributes.href = `${this.basePath}${parent.parent_id}`;
      link.add(new StringControl({ context: this.context, text: parent.name }));
      this.add(link);
    }
    
    // Current place (not a link)
    if (this.currentName) {
      this.add(new StringControl({ context: this.context, text: `${this.separator}${this.currentName}` }));
    }
  }
}

module.exports = { GazetteerBreadcrumbControl };
