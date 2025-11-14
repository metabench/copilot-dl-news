"use strict";

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime, formatCount } = require("./UrlListingTable");

const DOMAIN_DOWNLOAD_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "url", label: "URL", cellClass: "is-url" },
  { key: "fetchedAt", label: "Fetched", cellClass: "is-timestamp" },
  { key: "httpStatus", label: "HTTP", align: "center" },
  { key: "bytes", label: "Bytes", align: "right", cellClass: "is-metric" },
  { key: "words", label: "Words", align: "right", cellClass: "is-metric" },
  { key: "classification", label: "Classification" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return DOMAIN_DOWNLOAD_COLUMNS.map(cloneColumn);
}

function buildRows(entries = [], options = {}) {
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return entries.map((entry, index) => ({
    index: buildIndexCell(index, startIndex),
    url: entry.urlId
      ? { text: entry.url, href: `/urls/${entry.urlId}`, classNames: "is-url" }
      : { text: entry.url || "—", classNames: "is-url" },
    fetchedAt: { text: formatDateTime(entry.fetchedAt, true) },
    httpStatus: entry.httpStatus != null ? { text: String(entry.httpStatus) } : "—",
    bytes: entry.contentLength != null ? formatCount(entry.contentLength) : "—",
    words: entry.wordCount != null ? formatCount(entry.wordCount) : "—",
    classification: entry.classification || "—"
  }));
}

class DomainDownloadsTableControl extends TableControl {
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
  DomainDownloadsTableControl,
  buildDomainDownloadColumns: buildColumns,
  buildDomainDownloadRows: buildRows
};
