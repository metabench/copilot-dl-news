"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

const DEFAULT_TARGETS = Object.freeze([
  { domain: "bbc.com", label: "BBC" },
  { domain: "theguardian.com", label: "Guardian" },
  { domain: "reuters.com", label: "Reuters" },
  { domain: "nytimes.com", label: "NYTimes" },
  { domain: "washingtonpost.com", label: "Washington Post" },
  { domain: "cnn.com", label: "CNN" },
  { domain: "apnews.com", label: "AP" },
  { domain: "bloomberg.com", label: "Bloomberg" },
  { domain: "ft.com", label: "FT" },
  { domain: "npr.org", label: "NPR" }
]);

function normalizeTargets(targets) {
  const input = Array.isArray(targets) && targets.length ? targets : DEFAULT_TARGETS;
  return input.map((target) => {
    if (typeof target === "string") return { domain: target, label: target };
    return {
      domain: target.domain || target.host || "",
      label: target.label || target.domain || target.host || ""
    };
  }).filter((target) => target.domain);
}

class CloudCrawlPanelControl extends jsgui.Control {
  /**
   * Compact unified-shell panel for the cloud crawl operator path.
   *
   * @param {Object} spec
   * @param {Object} spec.context jsgui page context.
  * @param {Array<string|Object>} [spec.targets] Cloud crawl target list.
  * @param {number} [spec.maxPagesPerSite=1000] Per-site page goal.
   * @param {string} [spec.apiBase="/api/cloud-crawl"] Status API base path.
   * @param {string|null} [spec.since] Date/time lower bound for the compact status view.
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "section",
      __type_name: "cloud_crawl_panel"
    });

    this.targets = normalizeTargets(spec.targets);
    this.maxPagesPerSite = Number.isFinite(Number(spec.maxPagesPerSite)) ? Number(spec.maxPagesPerSite) : 1000;
    this.apiBase = spec.apiBase || "/api/cloud-crawl";
    this.since = spec.since === undefined ? new Date().toISOString().slice(0, 10) : spec.since;
    this.screenshotRoute = spec.screenshotRoute || "/?app=cloud-crawl";
    this.command = spec.command || `npm run crawl -- news-10x1000`;

    this.add_class("cloud-crawl-panel");
    this.add_class("home-dashboard");
    this.dom.attributes["data-cloud-crawl-root"] = "true";
    this.dom.attributes["data-cloud-crawl-api-base"] = this.apiBase;
    this.dom.attributes["data-cloud-crawl-domains"] = this.targets.map((target) => target.domain).join(",");
    this.dom.attributes["data-cloud-crawl-max-pages"] = String(this.maxPagesPerSite);
    this.dom.attributes["data-cloud-crawl-recent-limit"] = "12";
    if (this.since) this.dom.attributes["data-cloud-crawl-since"] = String(this.since);
    this.dom.attributes["data-cloud-crawl-command"] = this.command;
    this.dom.attributes["data-screenshot-subject"] = "cloud-crawl";
    this.dom.attributes["data-screenshot-route"] = this.screenshotRoute;

    if (!spec.el) this.compose();
  }

  compose() {
    this._composeHero();
    this._composeStats();
    this._composeHealthCard();
    this._composeRunStrip();
    this._composeTargets();
    this._composeRecent();
    this._composeStatus();
  }

  renderHtml() {
    return this.all_html_render();
  }

  _composeHero() {
    const hero = this._el("div", "panel-hero cloud-crawl-hero");
    hero.add(this._textEl("h2", "Cloud Crawl", "panel-hero__title"));
    hero.add(this._textEl("p", `${this.targets.length} sites / ${this.maxPagesPerSite} pages each / remote parallel`, "panel-hero__description"));
    this.add(hero);
  }

  _composeStats() {
    const stats = this._el("div", "panel-stats-row cloud-crawl-stats");
    stats.add(this._statCard("Remote", "remote", "configured"));
    stats.add(this._statCard("Active", "activeJobs", "-"));
    stats.add(this._statCard("Downloaded", "downloaded", "-"));
    stats.add(this._statCard("Errors", "errors", "-"));
    this.add(stats);
  }

  _composeHealthCard() {
    const section = this._el("div", "panel-section cloud-crawl-health", {
      "data-cloud-crawl-health-card": "true"
    });
    section.add(this._textEl("h3", "Operator Health", "panel-section__title"));
    const grid = this._el("div", "cloud-crawl-health__grid");
    grid.add(this._healthCell("Remote", "remote", "checking…"));
    grid.add(this._healthCell("Local watermark", "localWatermark", "—"));
    grid.add(this._healthCell("Last sync", "lastSyncDurationMs", "—"));
    grid.add(this._healthCell("Last pruned", "lastPrunedDeleted", "—"));
    grid.add(this._healthCell("Remote storage", "remoteContentMb", "—"));
    grid.add(this._healthCell("Sync lag", "syncLagMs", "—"));
    grid.add(this._healthCell("Ledger", "ledgerSummary", "—"));
    section.add(grid);
    this.add(section);
  }

  _healthCell(label, key, value) {
    const cell = this._el("div", "cloud-crawl-health__cell", {
      "data-cloud-crawl-health": key
    });
    cell.add(this._textEl("div", label, "cloud-crawl-health__label"));
    const valueEl = this._textEl("div", value, "cloud-crawl-health__value");
    valueEl.dom.attributes["data-cloud-crawl-health-value"] = key;
    cell.add(valueEl);
    return cell;
  }

  _composeRunStrip() {
    const section = this._el("div", "panel-section cloud-crawl-strip");
    const metrics = this._el("div", "cloud-crawl-strip__metrics");
    metrics.add(this._pill(`${this.targets.length} targets`, "targets"));
    metrics.add(this._pill(`${this.maxPagesPerSite} pages/site`, "pages"));
    metrics.add(this._pill("remote bounded", "mode"));
    metrics.add(this._pill(this.since ? `since ${this.since}` : "all time", "since"));
    section.add(metrics);

    const actions = this._el("div", "panel-btn-row cloud-crawl-actions");
    actions.add(this._button("Refresh", "button", "panel-btn panel-btn--default", {
      "data-cloud-crawl-action": "refresh"
    }));
    actions.add(this._link("Crawl Status", "/?app=crawl-status", "panel-btn panel-btn--ghost"));
    actions.add(this._link("Download Verify", "/?app=download-verification", "panel-btn panel-btn--ghost"));
    section.add(actions);
    this.add(section);
  }

  _composeTargets() {
    const section = this._el("div", "panel-section");
    section.add(this._textEl("h3", "Targets", "panel-section__title"));
    const grid = this._el("div", "cloud-crawl-target-grid", {
      "data-cloud-crawl-targets": "true"
    });
    this.targets.forEach((target) => grid.add(this._targetChip(target)));
    section.add(grid);
    this.add(section);
  }

  _composeRecent() {
    const section = this._el("div", "panel-section");
    section.add(this._textEl("h3", "Recent Downloads", "panel-section__title"));
    const recent = this._el("div", "panel-log panel-log--tall cloud-crawl-recent", {
      "data-cloud-crawl-recent": "true"
    });
    recent.add(this._textEl("div", "Loading...", "panel-log__empty"));
    section.add(recent);
    this.add(section);
  }

  _composeStatus() {
    const status = this._textEl("div", "Waiting for status...", "panel-status");
    status.dom.attributes["data-cloud-crawl-status"] = "true";
    this.add(status);
  }

  _statCard(label, key, value) {
    const card = this._el("div", "panel-stat-card");
    const valueEl = this._textEl("div", value, "panel-stat-card__value");
    valueEl.dom.attributes["data-cloud-crawl-stat"] = key;
    card.add(valueEl);
    card.add(this._textEl("div", label, "panel-stat-card__label"));
    return card;
  }

  _targetChip(target) {
    const chip = this._el("div", "cloud-crawl-target", {
      "data-cloud-crawl-domain": target.domain
    });
    chip.add(this._textEl("strong", target.label, "cloud-crawl-target__label"));
    chip.add(this._textEl("span", target.domain, "cloud-crawl-target__domain"));
    const count = this._textEl("span", `0 / ${this.maxPagesPerSite}`, "cloud-crawl-target__count");
    count.dom.attributes["data-cloud-crawl-domain-count"] = target.domain;
    chip.add(count);
    const bar = this._el("span", "cloud-crawl-target__bar");
    const fill = this._el("span", "cloud-crawl-target__fill", {
      "data-cloud-crawl-domain-bar": target.domain
    });
    bar.add(fill);
    chip.add(bar);
    return chip;
  }

  _pill(text, key) {
    const pill = this._el("span", "cloud-crawl-pill", {
      "data-cloud-crawl-pill": key
    });
    pill.add(new StringControl({ context: this.context, text }));
    return pill;
  }

  _button(text, type, className, attrs = {}) {
    const button = this._el("button", className, { type, ...attrs });
    button.add(new StringControl({ context: this.context, text }));
    return button;
  }

  _link(text, href, className) {
    const link = this._el("a", className, { href });
    link.add(new StringControl({ context: this.context, text }));
    return link;
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
  CloudCrawlPanelControl,
  DEFAULT_TARGETS
};