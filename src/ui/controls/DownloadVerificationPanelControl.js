"use strict";

/**
 * DownloadVerificationPanelControl
 *
 * Server-composed unified-shell panel for recent download persistence and
 * compression verification. Client behavior is supplied by the unified app
 * activator so this control remains SSR-friendly.
 */

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

class DownloadVerificationPanelControl extends jsgui.Control {
  /**
   * @param {Object} spec
   * @param {Object} spec.context jsgui page context.
   * @param {string} [spec.apiBase] API endpoint for verification data.
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "section",
      __type_name: "download_verification_panel"
    });

    this.add_class("download-verification-panel");
    this.add_class("home-dashboard");
    this.apiBase = spec.apiBase || "/api/downloads/verifications";
    this.dom.attributes["data-download-verification-root"] = "true";
    this.dom.attributes["data-download-verification-api-base"] = this.apiBase;

    if (!spec.el) this.compose();
  }

  compose() {
    this._composeHero();
    this._composeStats();
    this._composeControls();
    this._composeTable();
    this._composeStatus();
  }

  renderHtml() {
    return this.all_html_render();
  }

  _composeHero() {
    const hero = this._el("div", "panel-hero");
    hero.add(this._textEl("h2", "Download Verification", "panel-hero__title"));
    hero.add(this._textEl("p", "Recent database-backed download and compression evidence", "panel-hero__description"));
    this.add(hero);
  }

  _composeStats() {
    const stats = this._el("div", "panel-stats-row download-verification-stats");
    stats.add(this._statCard("Verified", "verified", "-"));
    stats.add(this._statCard("Saved", "saved", "-"));
    stats.add(this._statCard("Algorithms", "algorithms", "-"));
    stats.add(this._statCard("Levels", "levels", "-"));
    this.add(stats);
  }

  _composeControls() {
    const section = this._el("div", "panel-section");
    section.add(this._textEl("h3", "Verification Window", "panel-section__title"));

    const card = this._el("div", "panel-card download-verification-controls");
    const grid = this._el("div", "panel-form-grid");
    grid.add(this._composeLimitField());
    grid.add(this._composeSinceField());
    card.add(grid);

    const buttons = this._el("div", "panel-btn-row");
    buttons.add(this._button("Refresh", "button", "panel-btn panel-btn--default", {
      "data-download-verification-action": "refresh"
    }));
    card.add(buttons);
    section.add(card);
    this.add(section);
  }

  _composeTable() {
    const section = this._el("div", "panel-section");
    section.add(this._textEl("h3", "Recent Stored Downloads", "panel-section__title"));
    const card = this._el("div", "panel-card download-verification-table-card");
    const wrap = this._el("div", "download-verification-table-wrap", {
      "data-download-verification-table": "true"
    });
    wrap.add(this._textEl("div", "Loading...", "panel-log__empty"));
    card.add(wrap);
    section.add(card);
    this.add(section);
  }

  _composeStatus() {
    const status = this._textEl("div", "Last updated: -", "panel-status");
    status.dom.attributes["data-download-verification-status"] = "true";
    this.add(status);
  }

  _composeLimitField() {
    const wrapper = this._el("label", "download-verification-field");
    wrapper.add(this._textEl("span", "Recent Rows", "panel-label"));
    const select = this._el("select", "panel-select", {
      "data-download-verification-input": "limit"
    });
    [10, 25, 50, 100].forEach((value) => {
      const option = this._el("option", "", { value: String(value) });
      if (value === 25) option.dom.attributes.selected = "selected";
      option.add(new StringControl({ context: this.context, text: String(value) }));
      select.add(option);
    });
    wrapper.add(select);
    return wrapper;
  }

  _composeSinceField() {
    const wrapper = this._el("label", "download-verification-field");
    wrapper.add(this._textEl("span", "Since", "panel-label"));
    const input = this._el("input", "panel-input", {
      type: "datetime-local",
      "data-download-verification-input": "since"
    });
    wrapper.add(input);
    return wrapper;
  }

  _statCard(label, key, value) {
    const card = this._el("div", "panel-stat-card");
    const valueEl = this._textEl("div", value, "panel-stat-card__value");
    valueEl.dom.attributes["data-download-verification-stat"] = key;
    card.add(valueEl);
    card.add(this._textEl("div", label, "panel-stat-card__label"));
    return card;
  }

  _button(text, type, className, attrs = {}) {
    const button = this._el("button", className, { type, ...attrs });
    button.add(new StringControl({ context: this.context, text: `🔄 ${text}` }));
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

module.exports = { DownloadVerificationPanelControl };