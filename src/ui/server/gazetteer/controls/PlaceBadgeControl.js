"use strict";

/**
 * PlaceBadgeControl - Reusable badge for place metadata
 * 
 * Displays a labeled badge for kind, country, or other place attributes.
 * Used in search results, place details, and other gazetteer views.
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Badge variants
 */
const BADGE_VARIANTS = Object.freeze({
  KIND: "kind",
  COUNTRY: "country",
  DEFAULT: "default"
});

/**
 * Reusable badge control for place metadata
 * 
 * @example
 * const badge = new PlaceBadgeControl({
 *   context,
 *   text: "city",
 *   variant: "kind"
 * });
 */
class PlaceBadgeControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} spec.text - Badge text content
   * @param {string} [spec.variant] - Badge variant: "kind", "country", or "default"
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "span",
      __type_name: "place_badge"
    });
    
    this.add_class("gazetteer__badge");
    
    this.text = spec.text || "";
    this.variant = spec.variant || BADGE_VARIANTS.DEFAULT;
    
    if (this.variant && this.variant !== BADGE_VARIANTS.DEFAULT) {
      this.add_class(`gazetteer__badge--${this.variant}`);
    }
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the badge content
   */
  compose() {
    this.add(new StringControl({ context: this.context, text: this.text }));
  }
}

PlaceBadgeControl.VARIANTS = BADGE_VARIANTS;

module.exports = { PlaceBadgeControl, BADGE_VARIANTS };
