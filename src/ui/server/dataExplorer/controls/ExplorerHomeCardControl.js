"use strict";

/**
 * ExplorerHomeCardControl - Dashboard card for the Data Explorer
 * 
 * Displays a dashboard metric card with:
 * - Title/label
 * - Primary value
 * - Optional subtitle/description
 * - Optional variant styling
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Card variants for different visual styles
 */
const CARD_VARIANTS = Object.freeze({
  DEFAULT: "default",
  PRIMARY: "primary",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "danger"
});

/**
 * Dashboard card control for home/dashboard views
 * 
 * @example
 * const card = new ExplorerHomeCardControl({
 *   context,
 *   title: "Total URLs",
 *   value: 12345,
 *   subtitle: "Across all domains",
 *   variant: "primary"
 * });
 */
class ExplorerHomeCardControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} spec.title - Card title/label
   * @param {string|number} [spec.value] - Primary value to display
   * @param {string} [spec.subtitle] - Optional subtitle text
   * @param {string} [spec.variant] - Card variant for styling
   * @param {string} [spec.href] - Optional link URL
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "explorer_home_card"
    });
    
    this.add_class("data-explorer__card");
    
    this.title = spec.title || "Card";
    this.value = spec.value;
    this.subtitle = spec.subtitle || null;
    this.variant = spec.variant || null;
    this.href = spec.href || null;
    
    if (this.variant) {
      this.add_class(`data-explorer__card--${this.variant}`);
    }
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the card structure
   */
  compose() {
    // Card header with title
    const header = this._buildHeader();
    this.add(header);
    
    // Card content with value and subtitle
    const content = this._buildContent();
    this.add(content);
  }

  /**
   * Build the card header
   * @private
   */
  _buildHeader() {
    const header = new jsgui.Control({ context: this.context, tagName: "div" });
    header.add_class("data-explorer__card-header");
    
    const title = new jsgui.Control({ context: this.context, tagName: "h3" });
    title.add_class("data-explorer__card-title");
    
    if (this.href) {
      const link = new jsgui.Control({ context: this.context, tagName: "a" });
      link.dom.attributes.href = this.href;
      link.add(new StringControl({ context: this.context, text: this.title }));
      title.add(link);
    } else {
      title.add(new StringControl({ context: this.context, text: this.title }));
    }
    
    header.add(title);
    
    return header;
  }

  /**
   * Build the card content
   * @private
   */
  _buildContent() {
    const content = new jsgui.Control({ context: this.context, tagName: "div" });
    content.add_class("data-explorer__card-content");
    
    if (this.value !== undefined) {
      const value = new jsgui.Control({ context: this.context, tagName: "span" });
      value.add_class("data-explorer__card-value");
      value.add(new StringControl({ context: this.context, text: String(this.value) }));
      content.add(value);
    }
    
    if (this.subtitle) {
      const sub = new jsgui.Control({ context: this.context, tagName: "span" });
      sub.add_class("data-explorer__card-subtitle");
      sub.add(new StringControl({ context: this.context, text: this.subtitle }));
      content.add(sub);
    }
    
    return content;
  }
}

ExplorerHomeCardControl.VARIANTS = CARD_VARIANTS;

module.exports = { ExplorerHomeCardControl, CARD_VARIANTS };
