"use strict";

const jsgui = require("jsgui3-html");
const { createProgressBarControl } = require("./ProgressBar");

const StringControl = jsgui.String_Control;
const ProgressBarControl = createProgressBarControl(jsgui);

const DEFAULT_PHASES = Object.freeze([
  { id: "discovery", label: "Discovery" },
  { id: "acquisition", label: "Acquire" },
  { id: "archive", label: "Archive" },
  { id: "pagination", label: "Pages" }
]);

function normalizeProgress(progress = {}) {
  const visited = Number(progress.visited || progress.downloaded || 0);
  const queued = Number(progress.queued || progress.queue || 0);
  const errors = Number(progress.errors || 0);
  const articles = Number(progress.articles || progress.saved || 0);
  const total = Number(progress.total || 0);
  const percentComplete = Number.isFinite(Number(progress.percentComplete))
    ? Number(progress.percentComplete)
    : (total > 0 ? (visited / total) * 100 : null);
  return {
    visited,
    queued,
    errors,
    articles,
    total,
    percentComplete,
    phase: progress.phase || "idle",
    currentAction: progress.currentAction || progress.action || "idle",
    currentUrl: progress.currentUrl || progress.url || "",
    throttled: !!progress.throttled,
    throttleReason: progress.throttleReason || "",
    throttleDomain: progress.throttleDomain || ""
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function truncate(value, maxLength = 72) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

class CrawlProgressPanelControl extends jsgui.Control {
  /**
   * Shared crawl progress summary panel built from generic progress primitives.
   *
   * @param {object} spec
   * @param {object} spec.context jsgui context
   * @param {string} [spec.title="Crawl Progress"]
   * @param {object} [spec.progress]
   * @param {Array<object>} [spec.phases]
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "section", __type_name: "crawl_progress_panel" });
    this.title = spec.title || "Crawl Progress";
    this.progress = normalizeProgress(spec.progress || spec);
    this.phases = Array.isArray(spec.phases) && spec.phases.length ? spec.phases : DEFAULT_PHASES;

    this.add_class("crawl-progress-panel");
    this.dom.attributes["data-crawl-progress-panel"] = "true";

    if (!spec.el) this.compose();
  }

  compose() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("crawl-progress-panel__header");

    const title = new jsgui.Control({ context: this.context, tagName: "h3" });
    title.add_class("crawl-progress-panel__title");
    title.add(new StringControl({ context: this.context, text: this.title }));
    header.add(title);

    const status = new jsgui.Control({ context: this.context, tagName: "span" });
    status.add_class("crawl-progress-panel__status");
    status.add(new StringControl({ context: this.context, text: this._statusText() }));
    header.add(status);
    this.add(header);

    const activity = new jsgui.Control({ context: this.context, tagName: "div" });
    activity.add_class("crawl-progress-panel__activity");
    activity.dom.attributes.title = this.progress.currentUrl || "";
    activity.add(new StringControl({ context: this.context, text: this._activityText() }));
    this.add(activity);

    const value = Number.isFinite(this.progress.percentComplete)
      ? this.progress.percentComplete / 100
      : 0;
    this._progressBar = new ProgressBarControl({
      context: this.context,
      value,
      showPercentage: Number.isFinite(this.progress.percentComplete),
      indeterminate: !Number.isFinite(this.progress.percentComplete),
      color: this.progress.errors > 0 ? "ruby" : "emerald"
    });
    this.add(this._progressBar);

    const phaseRow = new jsgui.Control({ context: this.context, tagName: "div" });
    phaseRow.add_class("crawl-progress-panel__phases");
    this.phases.forEach((phase) => phaseRow.add(this._createPhase(phase)));
    this.add(phaseRow);

    const stats = new jsgui.Control({ context: this.context, tagName: "dl" });
    stats.add_class("crawl-progress-panel__stats");
    [
      ["Visited", this.progress.visited],
      ["Queue", this.progress.queued],
      ["Articles", this.progress.articles],
      ["Errors", this.progress.errors]
    ].forEach(([label, valueText]) => stats.add(this._createStat(label, valueText)));
    this.add(stats);

    if (this.progress.throttled) {
      const throttle = new jsgui.Control({ context: this.context, tagName: "div" });
      throttle.add_class("crawl-progress-panel__throttle");
      throttle.add(new StringControl({ context: this.context, text: this._throttleText() }));
      this.add(throttle);
    }
  }

  _createPhase(phase) {
    const active = this._phaseMatches(phase.id || phase.label);
    const pill = new jsgui.Control({ context: this.context, tagName: "span" });
    pill.add_class("crawl-progress-panel__phase");
    if (active) pill.add_class("crawl-progress-panel__phase--active");
    pill.dom.attributes["data-phase"] = String(phase.id || phase.label || "phase");
    pill.add(new StringControl({ context: this.context, text: String(phase.label || phase.id || "Phase") }));
    return pill;
  }

  _createStat(label, value) {
    const item = new jsgui.Control({ context: this.context, tagName: "div" });
    item.add_class("crawl-progress-panel__stat");

    const dt = new jsgui.Control({ context: this.context, tagName: "dt" });
    dt.add(new StringControl({ context: this.context, text: label }));
    item.add(dt);

    const dd = new jsgui.Control({ context: this.context, tagName: "dd" });
    dd.add(new StringControl({ context: this.context, text: formatNumber(value) }));
    item.add(dd);
    return item;
  }

  _phaseMatches(phaseId) {
    const phase = String(this.progress.phase || "").toLowerCase();
    const id = String(phaseId || "").toLowerCase();
    return !!id && (phase === id || phase.includes(id));
  }

  _statusText() {
    if (this.progress.throttled) return "Throttled";
    if (this.progress.errors > 0) return "Needs attention";
    if (this.progress.visited > 0 || this.progress.queued > 0) return "Running";
    return "Idle";
  }

  _activityText() {
    if (this.progress.currentUrl) return truncate(this.progress.currentUrl);
    if (this.progress.currentAction && this.progress.currentAction !== "idle") return this.progress.currentAction;
    return "Waiting to start";
  }

  _throttleText() {
    const reason = this.progress.throttleReason || "backoff";
    const domain = this.progress.throttleDomain || "domain";
    return `Throttle: ${reason} (${domain})`;
  }

  updateProgress(progress = {}) {
    this.progress = normalizeProgress({ ...this.progress, ...progress });
  }
}

module.exports = { CrawlProgressPanelControl };
