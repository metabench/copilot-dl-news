"use strict";

/**
 * SearchFormControl
 *
 * Shared, themeable search form control for jsgui3 SSR pages.
 * Intended to be reusable across apps (Data Explorer, Gazetteer, etc.).
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

class SearchFormControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context
   * @param {string} [spec.action]
   * @param {string} [spec.method]
   * @param {Object} [spec.home] - optional home link { text, href }
   * @param {Object} [spec.input] - input config { name, value, placeholder, type }
   * @param {Array} [spec.selects] - optional select configs [{ name, value, options: [{value,label}] }]
   * @param {Object} [spec.button] - button config { text, ariaLabel }
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "form",
      __type_name: "search_form"
    });

    this.add_class("search-form");

    this.action = spec.action || "/";
    this.method = spec.method || "get";

    this.home = spec.home || null;
    this.input = {
      name: (spec.input && spec.input.name) || "search",
      value: (spec.input && spec.input.value) || "",
      placeholder: (spec.input && spec.input.placeholder) || "Search…",
      type: (spec.input && spec.input.type) || "search"
    };

    this.selects = Array.isArray(spec.selects) ? spec.selects : [];
    this.button = {
      text: (spec.button && spec.button.text) || "🔍",
      ariaLabel: (spec.button && spec.button.ariaLabel) || "Search"
    };

    this.dom.attributes.action = this.action;
    this.dom.attributes.method = this.method;

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    if (this.home && this.home.href) {
      const homeLink = new jsgui.Control({ context: this.context, tagName: "a" });
      homeLink.add_class("search-form__home-link");
      homeLink.dom.attributes.href = this.home.href;
      homeLink.add(new StringControl({ context: this.context, text: this.home.text || "Home" }));
      this.add(homeLink);
    }

    const input = new jsgui.Control({ context: this.context, tagName: "input" });
    input.add_class("search-form__input");
    input.dom.attributes.type = this.input.type;
    input.dom.attributes.name = this.input.name;
    input.dom.attributes.placeholder = this.input.placeholder;
    if (this.input.value) {
      input.dom.attributes.value = this.input.value;
    }
    this.add(input);

    this.selects.forEach((selectSpec) => {
      if (!selectSpec || !selectSpec.name) return;
      const select = new jsgui.Control({ context: this.context, tagName: "select" });
      select.add_class("search-form__select");
      select.dom.attributes.name = selectSpec.name;

      const options = Array.isArray(selectSpec.options) ? selectSpec.options : [];
      options.forEach((optionSpec) => {
        if (!optionSpec) return;
        const option = new jsgui.Control({ context: this.context, tagName: "option" });
        option.dom.attributes.value = optionSpec.value;
        if (selectSpec.value != null && String(optionSpec.value) === String(selectSpec.value)) {
          option.dom.attributes.selected = "selected";
        }
        option.add(new StringControl({ context: this.context, text: optionSpec.label || String(optionSpec.value) }));
        select.add(option);
      });

      this.add(select);
    });

    const button = new jsgui.Control({ context: this.context, tagName: "button" });
    button.add_class("search-form__button");
    button.dom.attributes.type = "submit";
    button.dom.attributes["aria-label"] = this.button.ariaLabel;
    button.add(new StringControl({ context: this.context, text: this.button.text }));
    this.add(button);
  }
}

module.exports = { SearchFormControl };
