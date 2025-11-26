"use strict";

const jsgui = require("jsgui3-html");
const { ConfigMatrixControl } = require("./ConfigMatrixControl");
const { CrawlBehaviorPanelControl } = require("./CrawlBehaviorPanel");

const StringControl = jsgui.String_Control;

const STATUS_CLASS_MAP = {
  ok: "success",
  success: "success",
  info: "info",
  note: "info",
  accent: "accent",
  warn: "warn",
  warning: "warn",
  danger: "danger",
  error: "danger",
  muted: "muted"
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function createTextControl(context, tagName, text, className) {
  const control = new jsgui.Control({ context, tagName });
  if (className) {
    control.add_class(className);
  }
  if (text != null) {
    control.add(new StringControl({ context, text: String(text) }));
  }
  return control;
}

function hasProfileData(profile) {
  if (!profile || typeof profile !== "object") {
    return false;
  }
  return Boolean(profile.name || profile.startUrl || profile.host || (profile.sharedOverrides && Object.keys(profile.sharedOverrides).length));
}

function normalizeStatus(status) {
  if (!status) return null;
  if (typeof status === "string") {
    return { level: status, text: status };
  }
  if (typeof status === "object") {
    return {
      level: status.level || status.state || status.variant || "info",
      text: status.text || status.label || status.message || status.level || ""
    };
  }
  return null;
}

function formatKeyValueList(values = {}) {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" • ");
}

class CrawlConfigWorkspaceControl extends jsgui.Control {
  constructor(spec = {}) {
    const {
      groups = [],
      sequenceProfile = {},
      behaviors = [],
      timeline = [],
      diffSummary = []
    } = spec || {};
    super({ ...spec, tagName: "section" });
    this.add_class("crawl-config-workspace");
    this.groups = toArray(groups);
    this.sequenceProfile = sequenceProfile || {};
    this.behaviors = toArray(behaviors);
    this.timeline = toArray(timeline);
    this.diffSummary = toArray(diffSummary);
    if (!spec.el) {
      this.compose();
    }
  }

  setGroups(groups = []) {
    this.groups = toArray(groups);
    this.compose();
  }

  setSequenceProfile(sequenceProfile = {}) {
    this.sequenceProfile = sequenceProfile || {};
    this.compose();
  }

  setBehaviors(behaviors = []) {
    this.behaviors = toArray(behaviors);
    this.compose();
  }

  setTimeline(timeline = []) {
    this.timeline = toArray(timeline);
    this.compose();
  }

  setDiffSummary(diffSummary = []) {
    this.diffSummary = toArray(diffSummary);
    this.compose();
  }

  compose() {
    if (this.content) {
      this.content.clear();
    }
    this.add(this._buildPropertyWorkspace());
    if (hasProfileData(this.sequenceProfile)) {
      this.add(this._buildProfileDrawer());
    }
    if (this.timeline.length) {
      this.add(this._buildTimelineSection());
    }
    if (this.diffSummary.length) {
      this.add(this._buildDiffMiniMap());
    }
  }

  _buildPropertyWorkspace() {
    const container = new jsgui.Control({ context: this.context, tagName: "div" });
    container.add_class("crawl-config-workspace__property-grid");

    if (!this.groups.length) {
      container.add(this._buildEmptyState("No configuration groups available."));
      return container;
    }

    const tabBar = new jsgui.Control({ context: this.context, tagName: "div" });
    tabBar.add_class("crawl-config-workspace__tab-bar");

    this.groups.forEach((group, index) => {
      const button = new jsgui.Control({ context: this.context, tagName: "button" });
      button.add_class("crawl-config-workspace__tab");
      button.dom.attributes.type = "button";
      button.dom.attributes["data-tab-target"] = group.key || `group-${index}`;
      button.dom.attributes["data-editor-slot"] = "workspace-tab";
      if (index === 0) {
        button.add_class("is-active");
      }
      button.add(new StringControl({ context: this.context, text: group.label || group.key || "Group" }));
      if (group.description) {
        const hint = createTextControl(this.context, "span", group.description, "crawl-config-workspace__tab-hint");
        button.add(hint);
      }
      if (group.stats && typeof group.stats.overrides === "number") {
        const badge = this._createBadgeControl({ level: group.stats.overrides > 0 ? "accent" : "muted", text: `${group.stats.overrides} overrides` });
        if (badge) {
          badge.add_class("crawl-config-workspace__tab-badge");
          button.add(badge);
        }
      }
      tabBar.add(button);
    });

    const panels = new jsgui.Control({ context: this.context, tagName: "div" });
    panels.add_class("crawl-config-workspace__panels");

    this.groups.forEach((group, index) => {
      const panel = new jsgui.Control({ context: this.context, tagName: "div" });
      panel.add_class("crawl-config-workspace__panel");
      panel.dom.attributes["data-tab-key"] = group.key || `group-${index}`;
      if (index === 0) {
        panel.add_class("is-active");
      }
      const header = new jsgui.Control({ context: this.context, tagName: "header" });
      header.add_class("crawl-config-workspace__panel-header");
      header.add(new StringControl({ context: this.context, text: group.title || group.label || "Configuration" }));
      if (group.stats && group.stats.summary) {
        const summary = createTextControl(this.context, "span", group.stats.summary, "crawl-config-workspace__panel-summary");
        header.add(summary);
      }
      panel.add(header);
      const matrix = new ConfigMatrixControl({ context: this.context, sections: group.sections || [] });
      matrix.add_class("crawl-config-workspace__matrix");
      panel.add(matrix);
      panels.add(panel);
    });

    container.add(tabBar);
    container.add(panels);
    return container;
  }

  _buildProfileDrawer() {
    const drawer = new jsgui.Control({ context: this.context, tagName: "details" });
    drawer.add_class("crawl-config-workspace__profile");
    drawer.dom.attributes.open = "open";
    drawer.dom.attributes["data-editor-slot"] = "profile-drawer";

    const summary = new jsgui.Control({ context: this.context, tagName: "summary" });
    summary.add_class("crawl-config-workspace__profile-summary");
    summary.add(new StringControl({ context: this.context, text: `Crawl Profile: ${this.sequenceProfile.name || "unnamed"}` }));
    drawer.add(summary);

    const body = new jsgui.Control({ context: this.context, tagName: "div" });
    body.add_class("crawl-config-workspace__profile-body");

    const metadata = new jsgui.Control({ context: this.context, tagName: "dl" });
    metadata.add_class("crawl-config-workspace__profile-meta");
    this._appendMeta(metadata, "Sequence", this.sequenceProfile.name || "n/a");
    this._appendMeta(metadata, "Host", this.sequenceProfile.host || "n/a");
    this._appendMeta(metadata, "Start URL", this.sequenceProfile.startUrl || this.sequenceProfile.seed || "n/a");
    if (this.sequenceProfile.version) {
      this._appendMeta(metadata, "Version", this.sequenceProfile.version);
    }
    if (this.sequenceProfile.stats) {
      Object.entries(this.sequenceProfile.stats).forEach(([key, value]) => {
        this._appendMeta(metadata, key.charAt(0).toUpperCase() + key.slice(1), value);
      });
    }
    body.add(metadata);

    if (this.sequenceProfile.sharedOverrides && Object.keys(this.sequenceProfile.sharedOverrides).length) {
      const overridesList = new jsgui.Control({ context: this.context, tagName: "ul" });
      overridesList.add_class("crawl-config-workspace__overrides-list");
      Object.entries(this.sequenceProfile.sharedOverrides).forEach(([key, value]) => {
        const item = new jsgui.Control({ context: this.context, tagName: "li" });
        item.add_class("crawl-config-workspace__override");
        const label = createTextControl(this.context, "span", key, "crawl-config-workspace__override-key");
        
        let displayValue = value;
        if (typeof value === "object" && value !== null) {
          try {
            displayValue = JSON.stringify(value);
          } catch (_) {
            displayValue = String(value);
          }
        }
        
        const val = createTextControl(this.context, "span", displayValue, "crawl-config-workspace__override-value");
        item.add(label);
        item.add(val);
        overridesList.add(item);
      });
      body.add(overridesList);
    }

    if (this.behaviors.length) {
      const behaviorPanel = new CrawlBehaviorPanelControl({ context: this.context, behaviors: this.behaviors });
      behaviorPanel.add_class("crawl-config-workspace__behaviors");
      body.add(behaviorPanel);
    }

    drawer.add(body);
    return drawer;
  }

  _appendMeta(list, label, value) {
    if (value == null) {
      return;
    }
    const dt = createTextControl(this.context, "dt", label, "crawl-config-workspace__meta-label");
    const dd = createTextControl(this.context, "dd", value, "crawl-config-workspace__meta-value");
    list.add(dt);
    list.add(dd);
  }

  _buildTimelineSection() {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class("crawl-config-workspace__timeline");
    const heading = createTextControl(this.context, "h3", "Behavior Timeline", "crawl-config-workspace__timeline-title");
    section.add(heading);
    const list = new jsgui.Control({ context: this.context, tagName: "ol" });
    list.add_class("crawl-config-workspace__timeline-list");

    this.timeline.forEach((step, index) => {
      const item = new jsgui.Control({ context: this.context, tagName: "li" });
      item.add_class("crawl-config-workspace__timeline-item");
      item.dom.attributes["data-step-id"] = step.id || `step-${index + 1}`;
      const label = createTextControl(this.context, "div", step.label || `Step ${index + 1}`, "crawl-config-workspace__timeline-label");
      item.add(label);
      const meta = createTextControl(this.context, "div", step.operation || "operation", "crawl-config-workspace__timeline-operation");
      item.add(meta);
      if (step.summary) {
        const summary = createTextControl(this.context, "p", step.summary, "crawl-config-workspace__timeline-summary");
        item.add(summary);
      }
      if (step.impact && Object.keys(step.impact).length) {
        const impact = createTextControl(this.context, "div", formatKeyValueList(step.impact), "crawl-config-workspace__timeline-impact");
        item.add(impact);
      }
      if (step.overrides && Object.keys(step.overrides).length) {
        const overrides = new jsgui.Control({ context: this.context, tagName: "ul" });
        overrides.add_class("crawl-config-workspace__timeline-overrides");
        Object.entries(step.overrides).forEach(([key, value]) => {
          const chip = new jsgui.Control({ context: this.context, tagName: "li" });
          chip.add_class("crawl-config-workspace__timeline-override");
          chip.add(new StringControl({ context: this.context, text: `${key}: ${value}` }));
          overrides.add(chip);
        });
        item.add(overrides);
      }
      if (step.status) {
        const badge = this._createBadgeControl(step.status);
        if (badge) {
          badge.add_class("crawl-config-workspace__timeline-badge");
          item.add(badge);
        }
      }
      list.add(item);
    });

    section.add(list);
    return section;
  }

  _buildDiffMiniMap() {
    const section = new jsgui.Control({ context: this.context, tagName: "section" });
    section.add_class("crawl-config-workspace__diff-map");
    const heading = createTextControl(this.context, "h3", "Config Diff Mini-Map", "crawl-config-workspace__diff-title");
    section.add(heading);

    const grid = new jsgui.Control({ context: this.context, tagName: "div" });
    grid.add_class("crawl-config-workspace__diff-grid");

    this.diffSummary.forEach((entry) => {
      const card = new jsgui.Control({ context: this.context, tagName: "article" });
      card.add_class("crawl-config-workspace__diff-card");
      card.dom.attributes["data-diff-key"] = entry.key || entry.label || "diff";
      if (entry.scope) {
        card.dom.attributes["data-diff-scope"] = entry.scope;
      }
      const title = createTextControl(this.context, "h4", entry.label || entry.key, "crawl-config-workspace__diff-label");
      card.add(title);
      const source = createTextControl(this.context, "span", entry.source || entry.scope || "source", "crawl-config-workspace__diff-source");
      card.add(source);
      const values = new jsgui.Control({ context: this.context, tagName: "div" });
      values.add_class("crawl-config-workspace__diff-values");
      const from = createTextControl(this.context, "span", entry.defaultValue != null ? `default: ${entry.defaultValue}` : "default: —", "crawl-config-workspace__diff-value");
      const to = createTextControl(this.context, "span", entry.overrideValue != null ? `override: ${entry.overrideValue}` : "override: —", "crawl-config-workspace__diff-value");
      values.add(from);
      values.add(to);
      card.add(values);
      if (entry.note) {
        const note = createTextControl(this.context, "p", entry.note, "crawl-config-workspace__diff-note");
        card.add(note);
      }
      if (entry.status) {
        const badge = this._createBadgeControl(entry.status);
        if (badge) {
          badge.add_class("crawl-config-workspace__diff-badge");
          card.add(badge);
        }
      }
      grid.add(card);
    });

    section.add(grid);
    return section;
  }

  _buildEmptyState(text) {
    const empty = new jsgui.Control({ context: this.context, tagName: "p" });
    empty.add_class("crawl-config-workspace__empty");
    empty.add(new StringControl({ context: this.context, text }));
    return empty;
  }

  _createBadgeControl(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return null;
    const badge = new jsgui.Control({ context: this.context, tagName: "span" });
    badge.add_class("badge");
    badge.add_class("crawl-config-workspace__badge");
    const level = STATUS_CLASS_MAP[normalized.level] || normalized.level || "muted";
    badge.add_class(`badge--${level}`);
    badge.add(new StringControl({ context: this.context, text: normalized.text || normalized.level }));
    return badge;
  }
}

module.exports = {
  CrawlConfigWorkspaceControl
};
