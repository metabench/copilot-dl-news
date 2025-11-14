"use strict";

const jsgui = require("jsgui3-html");
const { TableControl } = require("./Table");

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

const CONFIG_COLUMNS = Object.freeze([
  { key: "property", label: "Property" },
  { key: "value", label: "Value" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildConfigMatrixColumns(overrides) {
  const base = Array.isArray(overrides) && overrides.length ? overrides : CONFIG_COLUMNS;
  return base.map(cloneColumn);
}

function formatValue(raw, formatHint) {
  if (raw == null) {
    return "—";
  }
  if (typeof formatHint === "function") {
    return formatHint(raw);
  }
  if (typeof raw === "string") {
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => formatValue(value)).join(", ");
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch (_) {
      return String(raw);
    }
  }
  return String(raw);
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

function buildConfigMatrixRows(properties = [], options = {}) {
  const defaultSourceLabel = options.defaultSourceLabel || "";
  return properties.map((property) => {
    const overrideBadge = property.isOverride ? { level: "accent", text: "override" } : null;
    const validationStatus = normalizeStatus(property.validation || property.status);
    return {
      property: {
        key: property.key || property.path || property.label,
        label: property.label || property.key || property.path || "Property",
        path: property.path || property.key || property.label,
        badge: property.badge || overrideBadge,
        description: property.description || property.hint || null
      },
      value: {
        key: property.key || property.path,
        raw: property.value,
        display: property.displayValue,
        unit: property.unit,
        behavior: property.behaviorSummary || property.behavior || null,
        formatHint: property.format,
        type: property.type || typeof property.value
      },
      source: {
        label: property.sourceLabel || property.source || defaultSourceLabel,
        file: property.sourceFile,
        isOverride: Boolean(property.isOverride),
        fallback: property.fallbackSource,
        scope: property.scope || "global"
      },
      notes: {
        status: validationStatus,
        hint: property.hint || property.note || property.description || null,
        behavior: property.behaviorSummary || property.behavior || null
      }
    };
  });
}

class ConfigMatrixControl extends jsgui.Control {
  constructor(spec = {}) {
    const { sections = [], columns } = spec || {};
    super({ ...spec, tagName: "div" });
    this.add_class("config-matrix");
    this.sections = Array.isArray(sections) ? sections : [];
    this.baseColumns = buildConfigMatrixColumns(columns);
    if (!spec.el) {
      this.compose();
    }
  }

  setSections(sections = []) {
    this.sections = Array.isArray(sections) ? sections : [];
    if (this.content) {
      this.content.clear();
    }
    this.compose();
  }

  compose() {
    if (!Array.isArray(this.sections) || this.sections.length === 0) {
      this.add(this._buildEmptyState());
      return;
    }
    this.sections.forEach((section) => {
      this.add(this._buildSection(section));
    });
  }

  _buildEmptyState() {
    const empty = new jsgui.Control({ context: this.context, tagName: "p" });
    empty.add_class("config-matrix__empty");
    empty.add(new StringControl({ context: this.context, text: "No configuration entries available." }));
    return empty;
  }

  _buildSection(section = {}) {
    const details = new jsgui.Control({ context: this.context, tagName: "details" });
    details.add_class("config-matrix__section");
    if (!section.collapsed) {
      details.dom.attributes.open = "open";
    }
    const summary = new jsgui.Control({ context: this.context, tagName: "summary" });
    summary.add_class("config-matrix__section-summary");
    const title = section.title || section.key || "Settings";
    summary.add(new StringControl({ context: this.context, text: title }));
    if (section.description) {
      const hint = new jsgui.Control({ context: this.context, tagName: "span" });
      hint.add_class("config-matrix__section-hint");
      hint.add(new StringControl({ context: this.context, text: section.description }));
      summary.add(hint);
    }
    details.add(summary);

    const rows = buildConfigMatrixRows(section.properties || [], { defaultSourceLabel: section.sourceLabel });
    const decoratedRows = rows.map((row) => ({
      property: this._renderPropertyCell(row.property),
      value: this._renderValueCell(row.value),
      source: this._renderSourceCell(row.source),
      notes: this._renderNotesCell(row.notes)
    }));
    const columns = buildConfigMatrixColumns(section.columns || this.baseColumns);
    const table = new TableControl({ context: this.context, columns, rows: decoratedRows });
    table.add_class("config-matrix__table");
    details.add(table);
    return details;
  }

  _renderPropertyCell(property = {}) {
    const fragments = [];
    if (property.badge) {
      const badge = this._createBadgeControl(property.badge);
      if (badge) {
        fragments.push(badge);
      }
    }
    const label = new jsgui.Control({ context: this.context, tagName: "span" });
    label.add_class("config-matrix__property-label");
    label.add(new StringControl({ context: this.context, text: property.label || property.key || "Property" }));
    label.dom.attributes["data-property-key"] = property.key || property.path || "";
    label.dom.attributes["data-editor-slot"] = "property";
    fragments.push(label);
    if (property.path && property.path !== property.label) {
      const meta = this._createMetaText(property.path);
      if (meta) fragments.push(meta);
    }
    if (property.description) {
      const hint = this._createHint(property.description);
      if (hint) fragments.push(hint);
    }
    return {
      content: fragments,
      classNames: "config-matrix__cell config-matrix__cell--property"
    };
  }

  _renderValueCell(value = {}) {
    const fragments = [];
    const displayText = value.display != null ? value.display : formatValue(value.raw, value.formatHint);
    const valueSpan = new jsgui.Control({ context: this.context, tagName: "span" });
    valueSpan.add_class("config-matrix__value");
    if (value.key) {
      valueSpan.dom.attributes["data-property-key"] = value.key;
    }
    valueSpan.dom.attributes["data-editor-slot"] = "value";
    valueSpan.add(new StringControl({ context: this.context, text: displayText }));
    fragments.push(valueSpan);
    if (value.unit) {
      const unit = this._createMetaText(value.unit);
      if (unit) fragments.push(unit);
    }
    if (value.behavior) {
      const hint = this._createHint(value.behavior);
      if (hint) fragments.push(hint);
    }
    return {
      content: fragments,
      classNames: "config-matrix__cell config-matrix__cell--value"
    };
  }

  _renderSourceCell(source = {}) {
    const fragments = [];
    const sourceLabel = source.label || source.file || "—";
    const span = new jsgui.Control({ context: this.context, tagName: "span" });
    span.add_class("config-matrix__source-label");
    span.add(new StringControl({ context: this.context, text: sourceLabel }));
    fragments.push(span);
    if (source.file && source.file !== sourceLabel) {
      const meta = this._createMetaText(source.file);
      if (meta) fragments.push(meta);
    }
    if (source.scope && source.scope !== "global") {
      const hint = this._createHint(`${source.scope} scope`);
      if (hint) fragments.push(hint);
    }
    if (source.isOverride) {
      const overrideBadge = this._createBadgeControl({ level: "accent", text: "override" });
      if (overrideBadge) {
        fragments.push(overrideBadge);
      }
    }
    if (source.fallback) {
      const fallback = this._createHint(`fallback: ${source.fallback}`);
      if (fallback) fragments.push(fallback);
    }
    return {
      content: fragments,
      classNames: "config-matrix__cell config-matrix__cell--source"
    };
  }

  _renderNotesCell(notes = {}) {
    const fragments = [];
    if (notes.status) {
      const badge = this._createBadgeControl(notes.status);
      if (badge) {
        fragments.push(badge);
      }
    }
    if (notes.hint) {
      const hint = this._createHint(notes.hint);
      if (hint) fragments.push(hint);
    }
    if (notes.behavior && notes.behavior !== notes.hint) {
      const meta = this._createMetaText(notes.behavior);
      if (meta) fragments.push(meta);
    }
    if (!fragments.length) {
      fragments.push(new StringControl({ context: this.context, text: "—" }));
    }
    return {
      content: fragments,
      classNames: "config-matrix__cell config-matrix__cell--notes"
    };
  }

  _createBadgeControl(status) {
    const normalized = normalizeStatus(status);
    if (!normalized) return null;
    const level = STATUS_CLASS_MAP[normalized.level] || normalized.level || "muted";
    const badge = new jsgui.Control({ context: this.context, tagName: "span" });
    badge.add_class("badge");
    badge.add_class(`badge--${level}`);
    badge.add_class("config-matrix__badge");
    badge.add(new StringControl({ context: this.context, text: normalized.text || normalized.level }));
    return badge;
  }

  _createMetaText(text) {
    if (!text) return null;
    const span = new jsgui.Control({ context: this.context, tagName: "span" });
    span.add_class("config-matrix__meta");
    span.add(new StringControl({ context: this.context, text }));
    return span;
  }

  _createHint(text) {
    if (!text) return null;
    const span = new jsgui.Control({ context: this.context, tagName: "span" });
    span.add_class("config-matrix__hint");
    span.add(new StringControl({ context: this.context, text }));
    return span;
  }

  static buildColumns(overrides) {
    return buildConfigMatrixColumns(overrides);
  }

  static buildRows(properties = [], options = {}) {
    return buildConfigMatrixRows(properties, options);
  }
}

module.exports = {
  ConfigMatrixControl,
  buildConfigMatrixColumns,
  buildConfigMatrixRows
};
