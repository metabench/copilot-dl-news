"use strict";

const jsgui = require("jsgui3-html");
const StringControl = jsgui.String_Control;

/**
 * Crawl throughput panel: rate of crawling over the last 1h / 6h / 24h.
 *
 * Shows, per window: pages crawled (the headline rate), documents stored,
 * MB downloaded, and MB stored-compressed in the DB — plus a normalized
 * pages/hour so the three windows are directly comparable (a slowing crawl
 * shows a lower 1h rate than its 24h average at a glance).
 *
 * SSR renders the static frame + data-* hooks; the 'crawl-throughput'
 * activator polls GET /api/v1/crawl-throughput and fills the numbers.
 * Inline styles on purpose so the panel renders without a dedicated stylesheet.
 */
const WINDOWS = [
  { key: "1h", title: "Last hour" },
  { key: "6h", title: "Last 6 hours" },
  { key: "24h", title: "Last 24 hours" }
];

class CrawlThroughputPanelControl extends jsgui.Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || "crawl_throughput_panel";
    spec.tag_name = "section";
    super(spec);
    this.apiBase = spec.apiBase || "/api/v1/crawl-throughput";
    this.add_class("crawl-throughput-panel");
    this.dom.attributes["data-tp-root"] = "true";
    this.dom.attributes["data-tp-api"] = this.apiBase;
    if (!spec.el) this.compose();
  }

  renderHtml() {
    return this.all_html_render();
  }

  _el(tagName, text, attrs = {}, styles = "") {
    const el = new jsgui.Control({ context: this.context, tag_name: tagName });
    for (const [k, v] of Object.entries(attrs)) el.dom.attributes[k] = v;
    if (styles) el.dom.attributes.style = styles;
    if (text != null) el.add(new StringControl({ context: this.context, text: String(text) }));
    return el;
  }

  _metricRow(win, key, label) {
    const row = this._el("div", null, {}, "display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;font-size:13px;");
    row.add(this._el("span", label, {}, "color:#6b7280;"));
    row.add(this._el("span", "—", { "data-tp-window": win, "data-tp-metric": key }, "font-weight:600;color:#0a0d14;font-variant-numeric:tabular-nums;"));
    return row;
  }

  _card(win, title) {
    const card = this._el("div", null, { "data-tp-card": win },
      "flex:1;min-width:180px;border:1px solid #d8d0c1;border-radius:10px;padding:14px 16px;background:#fbfaf7;");
    card.add(this._el("div", title, {}, "font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:6px;"));
    // Headline: pages crawled — a direct COUNT over this span, not a rate estimate.
    const head = this._el("div", null, {}, "display:flex;align-items:baseline;gap:6px;margin-bottom:10px;");
    head.add(this._el("span", "—", { "data-tp-window": win, "data-tp-metric": "pages" },
      "font-size:30px;font-weight:700;color:#0b0f1a;font-variant-numeric:tabular-nums;line-height:1.1;"));
    head.add(this._el("span", "pages", {}, "font-size:13px;color:#6b7280;"));
    card.add(head);
    card.add(this._metricRow(win, "documents", "📄 Documents"));
    card.add(this._metricRow(win, "down", "⬇ MB downloaded"));
    card.add(this._metricRow(win, "stored", "🗄️ MB stored (compressed)"));
    return card;
  }

  compose() {
    const hero = this._el("header", null, { class: "panel-hero" });
    hero.add(this._el("h2", "Crawl Rate", { class: "panel-hero__title" }));
    hero.add(this._el("p", "Pages, documents, and bytes over the last hour, 6 hours, and 24 hours", { class: "panel-hero__description" }));
    this.add(hero);

    const controls = this._el("div", null, {}, "display:flex;gap:10px;align-items:center;margin:8px 0 4px;");
    controls.add(this._el("button", "Refresh", { type: "button", "data-tp-action": "refresh" }));
    controls.add(this._el("span", "Loading…", { "data-tp-status": "true" }, "font-size:12px;color:#6b7280;"));
    this.add(controls);

    const grid = this._el("div", null, {}, "display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;");
    for (const w of WINDOWS) grid.add(this._card(w.key, w.title));
    this.add(grid);

    this.add(this._el("p", "Each window is an independent count measured over that span (by crawl fetch time) — not an extrapolation of the 1-hour figure. Documents = pages that produced stored content; MB stored is the actual on-disk size after compression. An idle crawler shows 0 in the shorter windows.",
      {}, "font-size:11px;color:#9ca3af;margin-top:12px;line-height:1.5;"));
  }

  activate() {
    if (!this.__active) super.activate();
  }
}

module.exports = { CrawlThroughputPanelControl };
