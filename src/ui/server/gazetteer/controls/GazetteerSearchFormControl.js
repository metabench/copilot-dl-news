"use strict";

/**
 * GazetteerSearchFormControl - Search form for the Gazetteer
 * 
 * A reusable search form control with:
 * - Home link/branding
 * - Text input for search query
 * - Kind filter dropdown
 * - Submit button
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Kind options for the search filter
 */
const KIND_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
  { value: "region", label: "Region" },
  { value: "state", label: "State" },
  { value: "county", label: "County" },
  { value: "town", label: "Town" },
  { value: "village", label: "Village" }
];

/**
 * Search form control for the Gazetteer
 * 
 * @example
 * const searchForm = new GazetteerSearchFormControl({
 *   context,
 *   query: "London",
 *   selectedKind: "city",
 *   placeholder: "Search places..."
 * });
 */
class GazetteerSearchFormControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {string} [spec.query] - Current search query value
   * @param {string} [spec.selectedKind] - Currently selected kind filter
   * @param {string} [spec.placeholder] - Input placeholder text
   * @param {string} [spec.action] - Form action URL
   * @param {string} [spec.homeText] - Text for home link
   * @param {string} [spec.homeHref] - URL for home link
   * @param {Array} [spec.kindOptions] - Custom kind filter options
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "form",
      __type_name: "gazetteer_search_form"
    });
    
    this.add_class("gazetteer__search-form");
    this.dom.attributes.action = spec.action || "/search";
    this.dom.attributes.method = "get";
    
    // Form state
    this.query = spec.query || "";
    this.selectedKind = spec.selectedKind || "";
    this.placeholder = spec.placeholder || "Search places...";
    this.homeText = spec.homeText || "Gazetteer Info";
    this.homeHref = spec.homeHref || "/";
    this.kindOptions = spec.kindOptions || KIND_OPTIONS;
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the form elements
   */
  compose() {
    // Home link
    const homeLink = this._buildHomeLink();
    this.add(homeLink);
    
    // Search input
    const input = this._buildSearchInput();
    this.add(input);
    
    // Kind filter dropdown
    const select = this._buildKindSelect();
    this.add(select);
    
    // Submit button
    const button = this._buildSubmitButton();
    this.add(button);
  }

  /**
   * Build the home link
   * @private
   */
  _buildHomeLink() {
    const homeLink = new jsgui.Control({ context: this.context, tagName: "a" });
    homeLink.dom.attributes.href = this.homeHref;
    homeLink.add_class("gazetteer__home-link");
    homeLink.add(new StringControl({ context: this.context, text: this.homeText }));
    return homeLink;
  }

  /**
   * Build the search input
   * @private
   */
  _buildSearchInput() {
    const input = new jsgui.Control({ context: this.context, tagName: "input" });
    input.dom.attributes.type = "text";
    input.dom.attributes.name = "q";
    input.dom.attributes.placeholder = this.placeholder;
    if (this.query) {
      input.dom.attributes.value = this.query;
    }
    input.add_class("gazetteer__search-input");
    return input;
  }

  /**
   * Build the kind filter select
   * @private
   */
  _buildKindSelect() {
    const select = new jsgui.Control({ context: this.context, tagName: "select" });
    select.dom.attributes.name = "kind";
    select.add_class("gazetteer__kind-select");
    
    for (const opt of this.kindOptions) {
      const option = new jsgui.Control({ context: this.context, tagName: "option" });
      option.dom.attributes.value = opt.value;
      if (opt.value === this.selectedKind) {
        option.dom.attributes.selected = "selected";
      }
      option.add(new StringControl({ context: this.context, text: opt.label }));
      select.add(option);
    }
    
    return select;
  }

  /**
   * Build the submit button
   * @private
   */
  _buildSubmitButton() {
    const button = new jsgui.Control({ context: this.context, tagName: "button" });
    button.dom.attributes.type = "submit";
    button.add_class("gazetteer__search-button");
    button.add(new StringControl({ context: this.context, text: "Search" }));
    return button;
  }
}

module.exports = { GazetteerSearchFormControl, KIND_OPTIONS };
