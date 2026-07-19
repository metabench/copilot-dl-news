"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

/**
 * Background-tasks panel: live progress for in-app tasks (analysis-run,
 * compression, ingest…) polled from /api/v1/background-tasks.
 *
 * SSR renders the static frame + data-* hooks; the client activator
 * ('background-tasks' in unifiedApp/activators.js) polls the API and updates
 * the bar/labels — the pragmatic progress-UI idiom (LESSONS: direct DOM set in
 * the activator, config via data attributes), not full MVVM.
 *
 * The progress bar uses inline styles on purpose: the panel must render
 * correctly with no dedicated stylesheet mounted.
 */
class BackgroundTasksPanelControl extends jsgui.Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || "background_tasks_panel";
    spec.tag_name = "section";
    super(spec);
    this.apiBase = spec.apiBase || "/api/v1/background-tasks";

    this.add_class("background-tasks-panel");
    this.dom.attributes["data-bt-root"] = "true";
    this.dom.attributes["data-bt-api-base"] = this.apiBase;

    if (!spec.el) {
      this.compose();
    }
  }

  renderHtml() {
    return this.all_html_render();
  }

  _el(tagName, text, attrs = {}, styles = "") {
    const el = new jsgui.Control({ context: this.context, tag_name: tagName });
    for (const [k, v] of Object.entries(attrs)) el.dom.attributes[k] = v;
    if (styles) el.dom.attributes.style = styles;
    if (text) el.add(new StringControl({ context: this.context, text }));
    return el;
  }

  compose() {
    const { context } = this;

    // Hero
    const hero = this._el("header", null, { class: "panel-hero" });
    hero.add(this._el("h2", "Background Tasks", { class: "panel-hero__title" }));
    hero.add(this._el(
      "p",
      "Live progress for in-app tasks (analysis, place matching, compression, ingestion)",
      { class: "panel-hero__description" }
    ));
    this.add(hero);

    // Active-task card with the progress bar
    const card = this._el("div", null, { "data-bt-active-card": "true" },
      "border:1px solid #d8d4c8;border-radius:8px;padding:14px 16px;margin:12px 0;background:#fbfaf7;");
    card.add(this._el("div", "No active task", { "data-bt-active-title": "true" },
      "font-weight:600;margin-bottom:6px;"));
    const track = this._el("div", null, { "data-bt-bar-track": "true", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
      "height:14px;border-radius:7px;background:#e8e4d8;overflow:hidden;");
    track.add(this._el("div", null, { "data-bt-bar-fill": "true" },
      "height:100%;width:0%;border-radius:7px;background:#2f7d4f;transition:width .4s ease;"));
    card.add(track);
    card.add(this._el("div", "Idle — no task running", { "data-bt-active-message": "true" },
      "font-size:12px;color:#666;margin-top:6px;"));
    this.add(card);

    // Actions
    const actions = this._el("div", null, {}, "display:flex;gap:8px;margin:10px 0;");
    actions.add(this._el("button", "Redo place matching", {
      type: "button",
      "data-bt-action": "redo-place-matching",
      title: "Re-match all articles to places (deletes each article's old relations first). Purges the pre-2026-07-19 wrong-headline relations."
    }));
    actions.add(this._el("button", "Refresh", { type: "button", "data-bt-action": "refresh" }));
    this.add(actions);

    // Status line + recent-task list target
    const status = this._el("div", "Loading tasks…", { "data-bt-status": "true" },
      "font-size:12px;color:#666;margin-bottom:6px;");
    this.add(status);
    this.add(this._el("div", null, { "data-bt-task-list": "true" }));
  }

  activate() {
    if (!this.__active) {
      super.activate();
      // Display shell only — live behavior lives in the unified-app activator
      // (registered under the 'background-tasks' activation key).
    }
  }
}

BackgroundTasksPanelControl.css = "";

module.exports = { BackgroundTasksPanelControl };
