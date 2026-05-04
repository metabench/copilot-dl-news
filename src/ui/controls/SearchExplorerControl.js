"use strict";

/**
 * SearchExplorerControl
 *
 * Shared jsgui3 control for the unified app's embedded article search panel.
 * The server composes the form and result containers; the unified shell
 * activates behavior through `buildSearchExplorerActivator()`.
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

const DATE_PRESETS = Object.freeze([
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
]);

class SearchExplorerControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context jsgui3 page context.
   * @param {string} [spec.apiBase] Base API path for options and search.
   * @param {Array<{value:string,label:string}>} [spec.datePresets]
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "section",
      __type_name: "search_explorer",
    });

    this.add_class("search-explorer-control");
    this.add_class("home-dashboard");
    this.apiBase = spec.apiBase || "/api/search-explorer";
    this.datePresets = Array.isArray(spec.datePresets) ? spec.datePresets : DATE_PRESETS;

    this.dom.attributes["data-search-explorer-root"] = "true";
    this.dom.attributes["data-search-api-base"] = this.apiBase;

    if (!spec.el) {
      this.compose();
    }
  }

  compose() {
    this._composeHero();
    this._composeForm();
    this._composeResults();
  }

  renderHtml() {
    return this.all_html_render();
  }

  _composeHero() {
    const hero = this._el("div", "panel-hero");
    const title = this._textEl("h2", "Article Search", "panel-hero__title");
    const meta = this._textEl("p", "Freshness-aware article lookup", "panel-hero__description");
    hero.add(title);
    hero.add(meta);
    this.add(hero);
  }

  _composeForm() {
    const form = this._el("form", "panel-card search-explorer-form", {
      "data-search-form": "true",
    });

    const firstRow = this._el("div", "panel-form-grid");
    firstRow.add(this._composeField("Query", this._input({
      type: "search",
      name: "q",
      placeholder: "Search articles",
      dataKind: "q",
      autofocus: true,
    })));
    firstRow.add(this._composeField("Author", this._input({
      type: "search",
      name: "author",
      placeholder: "Author name",
      dataKind: "author",
    })));
    form.add(firstRow);

    const secondRow = this._el("div", "panel-form-grid");
    secondRow.add(this._composeField("Domain", this._select({
      name: "domain",
      dataKind: "domain",
      options: [{ value: "", label: "All enabled domains" }],
    })));
    secondRow.add(this._composeField("Section", this._select({
      name: "section",
      dataKind: "section",
      options: [{ value: "", label: "All sections" }],
    })));
    form.add(secondRow);

    const thirdRow = this._el("div", "panel-form-grid");
    thirdRow.add(this._composeField("Date Range", this._select({
      name: "datePreset",
      dataKind: "datePreset",
      value: "7d",
      options: this.datePresets,
    })));
    thirdRow.add(this._composeEnabledOnlyField());
    form.add(thirdRow);

    const buttons = this._el("div", "panel-btn-row");
    const submit = this._button("Search", "submit", "panel-btn panel-btn--action panel-btn--default", {
      "data-search-action": "submit",
    });
    const reset = this._button("Reset", "reset", "panel-btn panel-btn--ghost", {
      "data-search-action": "reset",
    });
    buttons.add(submit);
    buttons.add(reset);
    form.add(buttons);

    const status = this._textEl("div", "Ready", "panel-status");
    status.dom.attributes["data-search-status"] = "true";
    form.add(status);

    this.add(form);
  }

  _composeResults() {
    const freshness = this._el("div", "panel-card search-explorer-freshness", {
      "data-search-freshness": "true",
    });
    freshness.add(this._textEl("span", "Freshness", "text-muted"));
    const summary = this._textEl("strong", "No search yet", "text-cream ml-10");
    summary.dom.attributes["data-search-freshness-summary"] = "true";
    freshness.add(summary);
    this.add(freshness);

    const results = this._el("div", "panel-log panel-log--tall search-explorer-results", {
      "data-search-results": "true",
    });
    const empty = this._textEl("div", "No results loaded.", "panel-log__empty");
    results.add(empty);
    this.add(results);
  }

  _composeField(labelText, control) {
    const wrapper = this._el("label", "search-explorer-field");
    wrapper.add(this._textEl("span", labelText, "panel-label"));
    wrapper.add(control);
    return wrapper;
  }

  _composeEnabledOnlyField() {
    const wrapper = this._el("label", "search-explorer-field search-explorer-field--checkbox");
    wrapper.add(this._textEl("span", "Domain Scope", "panel-label"));

    const row = this._el("span", "search-explorer-checkbox-row");
    const checkbox = this._el("input", "", {
      type: "checkbox",
      name: "enabledOnly",
      checked: "checked",
      "data-search-filter": "enabledOnly",
    });
    row.add(checkbox);
    row.add(new StringControl({ context: this.context, text: "Enabled domains only" }));
    wrapper.add(row);
    return wrapper;
  }

  _input({ type, name, placeholder, dataKind, autofocus = false }) {
    const input = this._el("input", "panel-input", {
      type,
      name,
      placeholder,
      "data-search-input": dataKind,
    });
    if (autofocus) {
      input.dom.attributes.autofocus = "autofocus";
    }
    return input;
  }

  _select({ name, dataKind, value = "", options = [] }) {
    const select = this._el("select", "panel-select", {
      name,
      "data-search-filter": dataKind,
    });
    options.forEach((optionSpec) => {
      const option = this._el("option", "", { value: optionSpec.value });
      if (String(optionSpec.value) === String(value)) {
        option.dom.attributes.selected = "selected";
      }
      option.add(new StringControl({ context: this.context, text: optionSpec.label }));
      select.add(option);
    });
    return select;
  }

  _button(text, type, className, attrs = {}) {
    const button = this._el("button", className, { type, ...attrs });
    button.add(new StringControl({ context: this.context, text }));
    return button;
  }

  _textEl(tagName, text, className = "") {
    const el = this._el(tagName, className);
    el.add(new StringControl({ context: this.context, text }));
    return el;
  }

  _el(tagName, className = "", attrs = {}) {
    const el = new jsgui.Control({ context: this.context, tagName });
    if (className) {
      String(className).split(/\s+/).filter(Boolean).forEach((name) => el.add_class(name));
    }
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== false) {
        el.dom.attributes[key] = String(value);
      }
    });
    return el;
  }
}

module.exports = { SearchExplorerControl, DATE_PRESETS };