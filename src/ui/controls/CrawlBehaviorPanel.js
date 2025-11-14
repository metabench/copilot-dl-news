"use strict";

const jsgui = require("jsgui3-html");

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

function buildCrawlBehaviorEntries(entries = []) {
  return entries.map((entry) => ({
    key: entry.key || entry.label,
    label: entry.label || entry.key || "Behavior",
    description: entry.description || entry.summary || null,
    scope: entry.scope || "global",
    mode: entry.mode || entry.type || "rule",
    impact: entry.impact || {},
    limits: entry.limits || {},
    cues: entry.cues || entry.conditions || [],
    derivedFrom: entry.derivedFrom || entry.sources || [],
    status: normalizeStatus(entry.status || entry.health),
    emphasis: entry.emphasis || null
  }));
}

class CrawlBehaviorPanelControl extends jsgui.Control {
  constructor(spec = {}) {
    const { behaviors = [] } = spec || {};
    super({ ...spec, tagName: "section" });
    this.add_class("crawl-behavior-panel");
    this.behaviors = Array.isArray(behaviors) ? behaviors : [];
    if (!spec.el) {
      this.compose();
    }
  }

  setBehaviors(behaviors = []) {
    this.behaviors = Array.isArray(behaviors) ? behaviors : [];
    if (this.content) {
      this.content.clear();
    }
    this.compose();
  }

  compose() {
    if (!this.behaviors.length) {
      const empty = new jsgui.Control({ context: this.context, tagName: "p" });
      empty.add_class("crawl-behavior-panel__empty");
      empty.add(new StringControl({ context: this.context, text: "No crawl behaviors available." }));
      this.add(empty);
      return;
    }
    this.behaviors.forEach((behavior) => {
      this.add(this._buildCard(behavior));
    });
  }

  _buildCard(behavior) {
    const card = new jsgui.Control({ context: this.context, tagName: "article" });
    card.add_class("crawl-behavior-panel__card");
    card.dom.attributes["data-behavior-key"] = behavior.key || behavior.label || "behavior";
    card.dom.attributes["data-editor-slot"] = "behavior-card";

    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("crawl-behavior-panel__card-header");

    const title = new jsgui.Control({ context: this.context, tagName: "h3" });
    title.add_class("crawl-behavior-panel__title");
    title.add(new StringControl({ context: this.context, text: behavior.label || behavior.key || "Behavior" }));
    header.add(title);

    if (behavior.status) {
      const badge = this._createBadgeControl(behavior.status);
      if (badge) {
        header.add(badge);
      }
    }

    card.add(header);

    if (behavior.description) {
      const paragraph = new jsgui.Control({ context: this.context, tagName: "p" });
      paragraph.add_class("crawl-behavior-panel__description");
      paragraph.add(new StringControl({ context: this.context, text: behavior.description }));
      card.add(paragraph);
    }

    const detailList = this._buildDetailList(behavior);
    card.add(detailList);

    return card;
  }

  _buildDetailList(behavior) {
    const list = new jsgui.Control({ context: this.context, tagName: "dl" });
    list.add_class("crawl-behavior-panel__details");

    this._appendDetail(list, "Scope", behavior.scope || "global");
    this._appendDetail(list, "Mode", behavior.mode || "rule");

    if (behavior.limits && Object.keys(behavior.limits).length) {
      const limitsText = Object.entries(behavior.limits)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" • ");
      this._appendDetail(list, "Limits", limitsText);
    }

    if (behavior.impact && Object.keys(behavior.impact).length) {
      const impactText = Object.entries(behavior.impact)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" • ");
      this._appendDetail(list, "Impact", impactText);
    }

    if (behavior.cues && behavior.cues.length) {
      this._appendDetail(list, "Cues", behavior.cues.join(", "));
    }

    if (behavior.derivedFrom && behavior.derivedFrom.length) {
      this._appendDetail(list, "Derived From", behavior.derivedFrom.join(", "));
    }

    if (behavior.emphasis) {
      this._appendDetail(list, "Emphasis", behavior.emphasis);
    }

    return list;
  }

  _appendDetail(list, label, value) {
    if (!value) return;
    const dt = new jsgui.Control({ context: this.context, tagName: "dt" });
    dt.add_class("crawl-behavior-panel__detail-label");
    dt.add(new StringControl({ context: this.context, text: label }));
    list.add(dt);

    const dd = new jsgui.Control({ context: this.context, tagName: "dd" });
    dd.add_class("crawl-behavior-panel__detail-value");
    dd.add(new StringControl({ context: this.context, text: value }));
    list.add(dd);
  }

  _createBadgeControl(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return null;
    const level = STATUS_CLASS_MAP[normalized.level] || normalized.level || "muted";
    const badge = new jsgui.Control({ context: this.context, tagName: "span" });
    badge.add_class("badge");
    badge.add_class(`badge--${level}`);
    badge.add_class("crawl-behavior-panel__badge");
    badge.add(new StringControl({ context: this.context, text: normalized.text || normalized.level }));
    return badge;
  }

  static buildBehaviorEntries(entries = []) {
    return buildCrawlBehaviorEntries(entries);
  }
}

module.exports = {
  CrawlBehaviorPanelControl,
  buildCrawlBehaviorEntries
};
