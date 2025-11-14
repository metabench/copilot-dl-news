"use strict";

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime, formatCount } = require("./UrlListingTable");

const DOMAIN_SUMMARY_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "host", label: "Host", cellClass: "is-host" },
  { key: "windowArticles", label: "Recent Articles", align: "right", cellClass: "is-metric" },
  { key: "allArticles", label: "All-Time Articles", align: "right", cellClass: "is-metric" },
  { key: "fetches", label: "Fetches", align: "right", cellClass: "is-metric" },
  { key: "lastSavedAt", label: "Last Saved", cellClass: "is-timestamp" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return DOMAIN_SUMMARY_COLUMNS.map(cloneColumn);
}

function buildRows(entries = [], options = {}) {
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return entries.map((entry, index) => ({
    index: buildIndexCell(index, startIndex),
    host: entry.host
      ? { text: entry.host, href: `/domains/${encodeURIComponent(entry.host)}`, classNames: "is-host" }
      : "—",
    windowArticles: formatCount(entry.windowArticles),
    allArticles: formatCount(entry.allArticles),
    fetches: formatCount(entry.fetches),
    lastSavedAt: formatDateTime(entry.lastSavedAt, true)
  }));
}

class DomainSummaryTableControl extends TableControl {
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
  DomainSummaryTableControl,
  buildDomainSummaryColumns: buildColumns,
  buildDomainSummaryRows: buildRows
};
