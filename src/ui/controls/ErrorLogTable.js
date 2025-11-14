"use strict";

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime } = require("./UrlListingTable");

const ERROR_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "occurredAt", label: "Occurred", cellClass: "is-timestamp" },
  { key: "host", label: "Host", cellClass: "is-host" },
  { key: "kind", label: "Kind" },
  { key: "code", label: "Code", align: "right", cellClass: "is-metric" },
  { key: "message", label: "Message" },
  { key: "url", label: "URL", cellClass: "is-url" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return ERROR_COLUMNS.map(cloneColumn);
}

function truncateText(value, maxLength = 160) {
  if (value == null) return "—";
  const text = String(value).trim();
  if (!text) return "—";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildRows(entries = [], options = {}) {
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return entries.map((entry, index) => {
    const detailText = entry.message || entry.details || "";
    const truncated = truncateText(detailText, options.maxMessageLength || 160);
    return {
      index: buildIndexCell(index, startIndex),
      occurredAt: formatDateTime(entry.at, true),
      host: entry.host
        ? { text: entry.host, href: `/domains/${encodeURIComponent(entry.host)}`, classNames: "is-host" }
        : "—",
      kind: entry.kind || "—",
      code: entry.code != null ? String(entry.code) : "—",
      message: truncated === "—"
        ? "—"
        : { text: truncated, title: detailText },
      url: entry.url ? { text: entry.url, title: entry.url, classNames: "is-url" } : "—"
    };
  });
}

class ErrorLogTableControl extends TableControl {
  constructor(spec = {}) {
    const { columns, rows, entries, startIndex } = spec || {};
    const resolvedColumns = Array.isArray(columns) && columns.length ? columns : buildColumns();
    super({ ...spec, columns: resolvedColumns });
    if (spec && spec.el) {
      return;
    }
    if (Array.isArray(rows) && rows.length) {
      this.setRows(rows);
    } else if (Array.isArray(entries) && entries.length) {
      this.setEntries(entries, { startIndex });
    }
  }

  setEntries(entries = [], options = {}) {
    const mapped = buildRows(entries, options);
    this.setRows(mapped);
  }

  static buildColumns() {
    return buildColumns();
  }

  static buildRows(entries = [], options = {}) {
    return buildRows(entries, options);
  }
}

module.exports = {
  ErrorLogTableControl,
  buildErrorLogColumns: buildColumns,
  buildErrorLogRows: buildRows
};
