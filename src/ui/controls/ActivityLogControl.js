"use strict";

const jsgui = require("jsgui3-html");

const StringControl = jsgui.String_Control;

const DEFAULT_TYPES = Object.freeze([
  { id: "info", label: "Info" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
  { id: "error", label: "Error" }
]);

function normalizeTypes(types) {
  const source = Array.isArray(types) && types.length ? types : DEFAULT_TYPES;
  return source.map((type) => ({
    id: String(type.id || type.value || type.label || "info"),
    label: String(type.label || type.id || "Info")
  }));
}

function normalizeLine(line, index) {
  if (typeof line === "string") {
    return { id: `line-${index}`, type: "info", text: line, timestamp: "" };
  }
  return {
    id: String(line.id || `line-${index}`),
    type: String(line.type || line.level || "info"),
    text: String(line.text || line.message || ""),
    timestamp: line.timestamp ? String(line.timestamp) : "",
    meta: line.meta ? String(line.meta) : ""
  };
}

class ActivityLogControl extends jsgui.Control {
  /**
   * Generic SSR-friendly activity log with optional type filters.
   *
   * @param {object} spec
   * @param {object} spec.context jsgui context
   * @param {string} [spec.title="Activity"]
   * @param {Array<object|string>} [spec.lines]
   * @param {Array<object>} [spec.types]
   * @param {number} [spec.visibleLines=8]
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "section", __type_name: "activity_log" });
    this.title = spec.title || "Activity";
    this.types = normalizeTypes(spec.types);
    this.visibleLines = Math.max(1, Number(spec.visibleLines || 8));
    this.lines = (Array.isArray(spec.lines) ? spec.lines : []).map(normalizeLine);
    this.emptyText = spec.emptyText || "No activity yet.";

    this.add_class("activity-log");
    this.dom.attributes["data-activity-log"] = "true";

    if (!spec.el) this.compose();
  }

  compose() {
    const header = new jsgui.Control({ context: this.context, tagName: "header" });
    header.add_class("activity-log__header");

    const title = new jsgui.Control({ context: this.context, tagName: "h3" });
    title.add_class("activity-log__title");
    title.add(new StringControl({ context: this.context, text: this.title }));
    header.add(title);

    const filters = new jsgui.Control({ context: this.context, tagName: "div" });
    filters.add_class("activity-log__filters");
    this.types.forEach((type) => {
      const chip = new jsgui.Control({ context: this.context, tagName: "span" });
      chip.add_class("activity-log__filter");
      chip.add_class(`activity-log__filter--${type.id}`);
      chip.dom.attributes["data-filter-type"] = type.id;
      chip.add(new StringControl({ context: this.context, text: type.label }));
      filters.add(chip);
    });
    header.add(filters);
    this.add(header);

    this._list = new jsgui.Control({ context: this.context, tagName: "div" });
    this._list.add_class("activity-log__list");
    this._visibleLines().forEach((line) => this._list.add(this._createLine(line)));

    if (this.lines.length === 0) {
      const empty = new jsgui.Control({ context: this.context, tagName: "div" });
      empty.add_class("activity-log__empty");
      empty.add(new StringControl({ context: this.context, text: this.emptyText }));
      this._list.add(empty);
    }

    this.add(this._list);
  }

  _visibleLines() {
    return this.lines.slice(-this.visibleLines);
  }

  _createLine(line) {
    const row = new jsgui.Control({ context: this.context, tagName: "div" });
    row.add_class("activity-log__row");
    row.add_class(`activity-log__row--${line.type}`);
    row.dom.attributes["data-line-type"] = line.type;

    const time = new jsgui.Control({ context: this.context, tagName: "span" });
    time.add_class("activity-log__time");
    time.add(new StringControl({ context: this.context, text: line.timestamp || "--:--:--" }));
    row.add(time);

    const text = new jsgui.Control({ context: this.context, tagName: "span" });
    text.add_class("activity-log__text");
    text.add(new StringControl({ context: this.context, text: line.text }));
    row.add(text);

    if (line.meta) {
      const meta = new jsgui.Control({ context: this.context, tagName: "span" });
      meta.add_class("activity-log__meta");
      meta.add(new StringControl({ context: this.context, text: line.meta }));
      row.add(meta);
    }

    return row;
  }

  addLine(line) {
    this.lines.push(normalizeLine(line, this.lines.length));
    if (this.lines.length > 500) this.lines = this.lines.slice(-500);
  }

  clear() {
    this.lines = [];
    const el = this._list?.dom?.el;
    if (el) el.innerHTML = "";
  }
}

module.exports = { ActivityLogControl };
