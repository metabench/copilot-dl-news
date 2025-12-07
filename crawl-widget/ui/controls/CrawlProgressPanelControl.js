"use strict";

const { createProgressBarControl } = require("../ProgressBarControl");

function createCrawlProgressPanelControl(jsgui, ProgressBarControl = createProgressBarControl(jsgui)) {
  const StringControl = jsgui.String_Control;

  class CrawlProgressPanelControl extends jsgui.Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "div" });
      this.add_class("cw-progress-panel");
      if (!spec.el) this.compose();
    }

    compose() {
      this._activityLine = new jsgui.Control({ context: this.context, tagName: "div" });
      this._activityLine.add_class("cw-activity-status");

      this._activityIcon = new jsgui.Control({ context: this.context, tagName: "span" });
      this._activityIcon.add_class("cw-activity-status__icon");
      this._activityIcon.add(new StringControl({ context: this.context, text: "⏸️" }));

      this._activityText = new jsgui.Control({ context: this.context, tagName: "span" });
      this._activityText.add_class("cw-activity-status__text");
      this._activityText.add(new StringControl({ context: this.context, text: "Idle" }));

      this._activityLine.add(this._activityIcon);
      this._activityLine.add(this._activityText);
      this.add(this._activityLine);

      this._progressBar = new ProgressBarControl({
        context: this.context,
        value: 0,
        color: "emerald",
        variant: "standard",
        showPercentage: true
      });
      this.add(this._progressBar);

      this._phaseRow = new jsgui.Control({ context: this.context, tagName: "div" });
      this._phaseRow.add_class("cw-phase-indicators");

      this._phaseIndicators = {
        discovery: this._createPhaseIndicator("🔍", "Discovery", false),
        acquisition: this._createPhaseIndicator("📥", "Acquire", false),
        archive: this._createPhaseIndicator("📁", "Archive", false),
        pagination: this._createPhaseIndicator("📄", "Pages", false)
      };

      Object.values(this._phaseIndicators).forEach((pi) => this._phaseRow.add(pi.container));
      this.add(this._phaseRow);

      const stats = new jsgui.Control({ context: this.context, tagName: "div" });
      stats.add_class("cw-progress-panel__stats");

      this._urlsStat = this._createStat("URLs", "0");
      this._queueStat = this._createStat("Queue", "0");
      this._articlesStat = this._createStat("Articles", "0");
      this._errorsStat = this._createStat("Errors", "0");

      stats.add(this._urlsStat.container);
      stats.add(this._queueStat.container);
      stats.add(this._articlesStat.container);
      stats.add(this._errorsStat.container);
      this.add(stats);

      this._throttleStatus = new jsgui.Control({ context: this.context, tagName: "div" });
      this._throttleStatus.add_class("cw-throttle-status");
      this._throttleStatus.dom.attributes.style = "display: none;";

      this._throttleIcon = new jsgui.Control({ context: this.context, tagName: "span" });
      this._throttleIcon.add_class("cw-throttle-status__icon");
      this._throttleIcon.add(new StringControl({ context: this.context, text: "⏳" }));

      this._throttleText = new jsgui.Control({ context: this.context, tagName: "span" });
      this._throttleText.add_class("cw-throttle-status__text");
      this._throttleText.add(new StringControl({ context: this.context, text: "" }));

      this._throttleStatus.add(this._throttleIcon);
      this._throttleStatus.add(this._throttleText);
      this.add(this._throttleStatus);
    }

    _createPhaseIndicator(icon, label, active) {
      const container = new jsgui.Control({ context: this.context, tagName: "div" });
      container.add_class("cw-phase-indicator");
      if (active) container.add_class("cw-phase-indicator--active");

      const iconEl = new jsgui.Control({ context: this.context, tagName: "span" });
      iconEl.add_class("cw-phase-indicator__icon");
      iconEl.add(new StringControl({ context: this.context, text: icon }));

      const labelEl = new jsgui.Control({ context: this.context, tagName: "span" });
      labelEl.add_class("cw-phase-indicator__label");
      labelEl.add(new StringControl({ context: this.context, text: label }));

      container.add(iconEl);
      container.add(labelEl);

      return { container, iconEl, labelEl, active };
    }

    _createStat(label, value) {
      const container = new jsgui.Control({ context: this.context, tagName: "div" });
      container.add_class("cw-stat");

      const labelEl = new jsgui.Control({ context: this.context, tagName: "span" });
      labelEl.add_class("cw-stat__label");
      labelEl.add(new StringControl({ context: this.context, text: `${label}:` }));

      const valueEl = new jsgui.Control({ context: this.context, tagName: "span" });
      valueEl.add_class("cw-stat__value");
      valueEl.add(new StringControl({ context: this.context, text: value }));

      container.add(labelEl);
      container.add(valueEl);

      return { container, labelEl, valueEl };
    }

    updateProgress(data) {
      const {
        visited = 0,
        queued = 0,
        errors = 0,
        articles = 0,
        total,
        percentComplete,
        currentUrl,
        currentAction,
        phase,
        throttled,
        throttleReason,
        throttleDomain
      } = data;

      if (currentUrl || currentAction) {
        this._updateActivityStatus(currentAction || "crawling", currentUrl);
      }

      let progress = 0;
      if (percentComplete != null) {
        progress = percentComplete / 100;
      } else if (total > 0) {
        progress = visited / total;
      } else if (visited > 0 && queued >= 0) {
        progress = visited / (visited + queued);
      }

      this._progressBar.setValue(Math.min(1, progress));

      if (phase) {
        this._updatePhaseIndicators(phase);
      }

      this._updateStat(this._urlsStat.valueEl, this._formatNumber(visited));
      this._updateStat(this._queueStat.valueEl, this._formatNumber(queued));
      this._updateStat(this._articlesStat.valueEl, this._formatNumber(articles));
      this._updateStat(this._errorsStat.valueEl, this._formatNumber(errors));

      if (throttled) {
        this._showThrottleStatus(throttleReason, throttleDomain);
      } else {
        this._hideThrottleStatus();
      }

      if (visited > 0 && errors / visited > 0.1) {
        this._progressBar.setColor("ruby");
      } else {
        this._progressBar.setColor("emerald");
      }
    }

    _updateActivityStatus(action, url) {
      const iconEl = this._el(this._activityIcon);
      const textEl = this._el(this._activityText);
      if (!iconEl || !textEl) return;

      const actionIcons = {
        crawling: "🕷️",
        downloading: "📥",
        parsing: "📄",
        queueing: "➕",
        waiting: "⏳",
        "archive-discovery": "📁",
        "pagination-speculation": "📄",
        idle: "⏸️"
      };

      iconEl.textContent = actionIcons[action] || "🔄";

      if (url) {
        const truncatedUrl = url.length > 45 ? `${url.substring(0, 42)}...` : url;
        textEl.textContent = truncatedUrl;
        textEl.title = url;
      } else {
        textEl.textContent = action.charAt(0).toUpperCase() + action.slice(1);
        textEl.title = "";
      }
    }

    _updatePhaseIndicators(phase) {
      const phases = {
        discovery: ["discovery", "discover-structure"],
        acquisition: ["acquisition", "downloading", "article"],
        archive: ["archive-discovery", "sitemap"],
        pagination: ["pagination-speculation", "pagination"]
      };

      Object.entries(this._phaseIndicators).forEach(([key, indicator]) => {
        const containerEl = this._el(indicator.container);
        if (!containerEl) return;

        const isActive = phases[key]?.some((p) => phase.toLowerCase().includes(p.toLowerCase()));
        containerEl.classList.toggle("cw-phase-indicator--active", isActive);
      });
    }

    _showThrottleStatus(reason, domain) {
      const statusEl = this._el(this._throttleStatus);
      const iconEl = this._el(this._throttleIcon);
      const textEl = this._el(this._throttleText);
      if (!statusEl) return;

      statusEl.style.display = "flex";

      if (iconEl) {
        iconEl.textContent = reason === "rate-limit" ? "🔴" : reason === "circuit-breaker" ? "⚡" : "⏳";
      }

      if (textEl) {
        const message =
          reason === "rate-limit"
            ? `Rate limited: ${domain || "waiting"}`
            : reason === "circuit-breaker"
            ? `Circuit open: ${domain || "paused"}`
            : `Backoff: ${domain || "waiting"}`;
        textEl.textContent = message;
      }
    }

    _hideThrottleStatus() {
      const statusEl = this._el(this._throttleStatus);
      if (statusEl) statusEl.style.display = "none";
    }

    setIdle() {
      this._updateActivityStatus("idle", null);
      Object.values(this._phaseIndicators).forEach((pi) => {
        const el = this._el(pi.container);
        if (el) el.classList.remove("cw-phase-indicator--active");
      });
      this._hideThrottleStatus();
    }

    _updateStat(valueCtrl, text) {
      const el = valueCtrl?.dom?.el;
      if (el) el.textContent = text;
    }

    _formatNumber(num) {
      return num.toLocaleString();
    }

    _el(ctrl = this) {
      return ctrl?.dom?.el || null;
    }

    activate() {
      if (this.__active) return;
      super.activate();
    }
  }

  return CrawlProgressPanelControl;
}

module.exports = { createCrawlProgressPanelControl };
