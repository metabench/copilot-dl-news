"use strict";

const { TableControl } = require("./Table");

const URL_LISTING_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "urlId", label: "ID", align: "right", cellClass: "is-id" },
  { key: "url", label: "URL", cellClass: "is-url" },
  { key: "host", label: "Host", cellClass: "is-host" },
  { key: "createdAt", label: "Created", cellClass: "is-timestamp" },
  { key: "lastSeenAt", label: "Last Seen", cellClass: "is-timestamp" },
  { key: "lastFetchAt", label: "Last Fetch", cellClass: "is-timestamp" },
  { key: "status", label: "HTTP", align: "center" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return URL_LISTING_COLUMNS.map(cloneColumn);
}

function formatCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "0";
  return numeric.toLocaleString("en-US");
}

function formatDateTime(value, includeSeconds = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  const base = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${includeSeconds ? `:${pad(date.getUTCSeconds())}` : ""}`;
  return `${base} ${time} UTC`;
}

function formatStatus(code) {
  if (code == null) return { text: "—", classNames: "badge badge--muted" };
  let variant = "info";
  if (code >= 200 && code < 300) variant = "success";
  else if (code >= 300 && code < 400) variant = "accent";
  else if (code >= 400 && code < 500) variant = "warn";
  else if (code >= 500) variant = "danger";
  return { text: String(code), classNames: `badge badge--${variant}` };
}

function buildIndexCell(position, startIndex = 1) {
  const base = Number.isFinite(startIndex) ? Math.max(1, Math.trunc(startIndex)) : 1;
  const offset = Number.isFinite(position) ? Math.trunc(position) : 0;
  return { text: String(base + offset), classNames: "is-index" };
}

function buildDisplayRows(rows, options = {}) {
  const baseIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return rows.map((row, index) => ({
    index: buildIndexCell(index, baseIndex),
    urlId: row.id != null ? { text: String(row.id), classNames: "is-id" } : "—",
    url: (() => {
      const cell = { text: row.url, title: row.url, classNames: "is-url" };
      if (row.id != null) {
        cell.href = `/urls/${row.id}`;
      }
      return cell;
    })(),
    host: row.host
      ? { text: row.host, href: `/domains/${encodeURIComponent(row.host)}`, classNames: "is-host" }
      : "—",
    createdAt: formatDateTime(row.createdAt),
    lastSeenAt: formatDateTime(row.lastSeenAt),
    lastFetchAt: formatDateTime(row.lastFetchAt),
    status: formatStatus(row.httpStatus)
  }));
}

class UrlListingTableControl extends TableControl {
  constructor(spec = {}) {
    const { columns, records, rows, startIndex, rowOptions, ...rest } = spec || {};
    const resolvedColumns = Array.isArray(columns) && columns.length ? columns : buildColumns();
    super({ ...rest, columns: resolvedColumns });
    if (spec && spec.el) {
      return;
    }
    if (Array.isArray(rows) && rows.length) {
      this.setRows(rows);
    } else if (Array.isArray(records) && records.length) {
      this.setRecords(records, rowOptions || { startIndex });
    }
  }

  setRecords(records = [], options = {}) {
    const mapped = buildDisplayRows(records, options);
    this.setRows(mapped);
  }

  static buildColumns() {
    return buildColumns();
  }

  static buildRows(records = [], options = {}) {
    return buildDisplayRows(records, options);
  }
}

module.exports = {
  UrlListingTableControl,
  buildColumns,
  buildDisplayRows,
  buildIndexCell,
  formatDateTime,
  formatCount
};
