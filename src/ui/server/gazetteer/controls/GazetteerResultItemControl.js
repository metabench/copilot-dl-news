"use strict";

/**
 * GazetteerResultItemControl - Search result item for the Gazetteer
 * 
 * Displays a single search result with:
 * - Place name (linked)
 * - Matched name (if different from canonical)
 * - Kind and country badges
 * - Population (if available)
 */

const jsgui = require("jsgui3-html");
const { PlaceBadgeControl } = require("./PlaceBadgeControl");

const StringControl = jsgui.String_Control;

/**
 * Search result item control
 * 
 * @example
 * const item = new GazetteerResultItemControl({
 *   context,
 *   place: {
 *     id: 123,
 *     canonical_name: "London",
 *     matched_name: "London",
 *     kind: "city",
 *     country_code: "GB",
 *     population: 8982000
 *   }
 * });
 */
class GazetteerResultItemControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {Object} spec.place - Place data object
   * @param {number|string} spec.place.id - Place ID
   * @param {string} spec.place.canonical_name - Canonical place name
   * @param {string} [spec.place.matched_name] - Name that matched the search
   * @param {string} spec.place.kind - Place kind (city, country, etc.)
   * @param {string} spec.place.country_code - ISO country code
   * @param {number} [spec.place.population] - Population count
   * @param {string} [spec.basePath] - Base path for place links (default: "/place/")
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "gazetteer_result_item"
    });
    
    this.add_class("gazetteer__result-item");
    
    this.place = spec.place || {};
    this.basePath = spec.basePath || "/place/";
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the result item
   */
  compose() {
    // Left side: name and badges
    const left = this._buildLeftSection();
    this.add(left);
    
    // Right side: population (if available)
    if (this.place.population) {
      const pop = this._buildPopulationSection();
      this.add(pop);
    }
  }

  /**
   * Build the left section with name and badges
   * @private
   */
  _buildLeftSection() {
    const left = new jsgui.Control({ context: this.context, tagName: "div" });
    left.add_class("gazetteer__result-left");
    
    // Name link
    const link = new jsgui.Control({ context: this.context, tagName: "a" });
    link.dom.attributes.href = `${this.basePath}${this.place.id}`;
    link.add_class("gazetteer__result-name");
    link.add(new StringControl({ 
      context: this.context, 
      text: this.place.canonical_name || this.place.matched_name 
    }));
    left.add(link);
    
    // Show matched name if different
    if (this.place.matched_name && 
        this.place.canonical_name && 
        this.place.matched_name !== this.place.canonical_name) {
      const match = new jsgui.Control({ context: this.context, tagName: "span" });
      match.add_class("gazetteer__matched-name");
      match.add(new StringControl({ 
        context: this.context, 
        text: ` (matched: ${this.place.matched_name})` 
      }));
      left.add(match);
    }
    
    // Badges
    const meta = new jsgui.Control({ context: this.context, tagName: "div" });
    meta.add_class("gazetteer__result-meta");
    
    if (this.place.kind) {
      const kindBadge = new PlaceBadgeControl({
        context: this.context,
        text: this.place.kind,
        variant: "kind"
      });
      meta.add(kindBadge);
    }
    
    if (this.place.country_code) {
      const countryBadge = new PlaceBadgeControl({
        context: this.context,
        text: this.place.country_code,
        variant: "country"
      });
      meta.add(countryBadge);
    }
    
    left.add(meta);
    
    return left;
  }

  /**
   * Build the population section
   * @private
   */
  _buildPopulationSection() {
    const pop = new jsgui.Control({ context: this.context, tagName: "div" });
    pop.add_class("gazetteer__result-population");
    
    const popLabel = new jsgui.Control({ context: this.context, tagName: "div" });
    popLabel.add_class("gazetteer__pop-label");
    popLabel.add(new StringControl({ context: this.context, text: "Population" }));
    pop.add(popLabel);
    
    const popValue = new jsgui.Control({ context: this.context, tagName: "div" });
    popValue.add_class("gazetteer__pop-value");
    popValue.add(new StringControl({ 
      context: this.context, 
      text: this.place.population.toLocaleString() 
    }));
    pop.add(popValue);
    
    return pop;
  }
}

module.exports = { GazetteerResultItemControl };
