"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

class ScreenshotReviewPanelControl extends jsgui.Control {
  /**
   * Control Center panel for browsing screenshot runs and writing review comments.
   *
   * @param {Object} spec
   * @param {Object} spec.context jsgui page context.
   * @param {string} [spec.apiBase="/api/screenshot-review"] Screenshot review API base path.
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "section",
      __type_name: "screenshot_review_panel"
    });

    this.apiBase = spec.apiBase || "/api/screenshot-review";
    this.add_class("screenshot-review-panel");
    this.add_class("home-dashboard");
    this.dom.attributes["data-screenshot-review-root"] = "true";
    this.dom.attributes["data-screenshot-review-api-base"] = this.apiBase;
    this.dom.attributes["data-screenshot-subject"] = "screenshot-review";
    this.dom.attributes["data-screenshot-route"] = "/?app=screenshot-review";

    if (!spec.el) this.compose();
  }

  compose() {
    this._composeHero();
    this._composeStats();
    this._composeBody();
    this._composeStatus();
  }

  renderHtml() {
    return this.all_html_render();
  }

  _composeHero() {
    const hero = this._el("div", "panel-hero screenshot-review-hero");
    hero.add(this._textEl("h2", "Screenshot Review", "panel-hero__title"));
    hero.add(this._textEl("p", "Browse UI screenshot runs, inspect evidence, and leave comments for later improvement passes.", "panel-hero__description"));
    this.add(hero);
  }

  _composeStats() {
    const stats = this._el("div", "panel-stats-row screenshot-review-stats");
    stats.add(this._statCard("Runs", "runs", "-"));
    stats.add(this._statCard("Images", "images", "-"));
    stats.add(this._statCard("Comments", "comments", "-"));
    stats.add(this._statCard("Latest", "latest", "-"));
    this.add(stats);
  }

  _composeBody() {
    const layout = this._el("div", "screenshot-review-layout panel-section");

    const runs = this._el("div", "panel-card screenshot-review-runs");
    runs.add(this._textEl("h3", "Runs", "panel-section__title"));
    const filters = this._el("div", "screenshot-review-filters");
    const sessionFilter = this._el("select", "panel-select", {
      "data-screenshot-review-filter": "session"
    });
    sessionFilter.add(this._option("all", "All sessions"));
    filters.add(sessionFilter);
    const appFilter = this._el("select", "panel-select", {
      "data-screenshot-review-filter": "app"
    });
    appFilter.add(this._option("all", "All apps"));
    filters.add(appFilter);
    filters.add(this._button("Refresh", "button", "panel-btn panel-btn--default screenshot-review-refresh", {
      "data-screenshot-review-action": "refresh"
    }));
    runs.add(filters);
    const runList = this._el("div", "screenshot-review-run-list", {
      "data-screenshot-review-runs": "true"
    });
    runList.add(this._textEl("div", "Loading screenshot runs...", "panel-log__empty"));
    runs.add(runList);
    layout.add(runs);

    const detail = this._el("div", "screenshot-review-detail");
    const gallery = this._el("div", "panel-card screenshot-review-gallery", {
      "data-screenshot-review-gallery": "true"
    });
    gallery.add(this._textEl("div", "Select a run to view screenshots.", "panel-log__empty"));
    detail.add(gallery);

    const commentCard = this._el("div", "panel-card screenshot-review-comments");
    commentCard.add(this._textEl("h3", "Comments", "panel-section__title"));
    const existing = this._el("pre", "screenshot-review-comment-log", {
      "data-screenshot-review-comments": "true"
    });
    existing.add(new StringControl({ context: this.context, text: "No run selected." }));
    commentCard.add(existing);

    const form = this._el("form", "screenshot-review-comment-form", {
      "data-screenshot-review-comment-form": "true"
    });
    const target = this._el("select", "panel-select", {
      "data-screenshot-review-comment-target": "true"
    });
    target.add(this._option("run", "Whole run"));
    form.add(target);
    const textarea = this._el("textarea", "panel-input screenshot-review-comment-input", {
      rows: "4",
      placeholder: "Write a screenshot comment for a later agent...",
      "data-screenshot-review-comment-input": "true"
    });
    form.add(textarea);
    form.add(this._button("Save Comment", "submit", "panel-btn panel-btn--default"));
    commentCard.add(form);
    detail.add(commentCard);
    layout.add(detail);

    this.add(layout);
  }

  _composeStatus() {
    const status = this._textEl("div", "Loading screenshot review data...", "panel-status");
    status.dom.attributes["data-screenshot-review-status"] = "true";
    this.add(status);
  }

  _statCard(label, key, value) {
    const card = this._el("div", "panel-stat-card");
    const valueEl = this._textEl("div", value, "panel-stat-card__value");
    valueEl.dom.attributes["data-screenshot-review-stat"] = key;
    card.add(valueEl);
    card.add(this._textEl("div", label, "panel-stat-card__label"));
    return card;
  }

  _button(text, type, className, attrs = {}) {
    const button = this._el("button", className, { type, ...attrs });
    button.add(new StringControl({ context: this.context, text }));
    return button;
  }

  _option(value, text) {
    const option = this._el("option", "", { value });
    option.add(new StringControl({ context: this.context, text }));
    return option;
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

module.exports = {
  ScreenshotReviewPanelControl
};