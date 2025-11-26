"use strict";

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime, formatCount } = require("./UrlListingTable");

/**
 * Format a count value, handling null as a "[loading]" placeholder.
 * @param {number|null} value - The count value or null for deferred loading
 * @returns {string|Object} Formatted count or loading placeholder object
 */
function formatCountOrLoading(value) {
  if (value === null || value === undefined) {
    return { text: "[loading]", classNames: "is-loading" };
  }
  return formatCount(value);
}

const DOMAIN_SUMMARY_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "host", label: "Host", cellClass: "is-host" },
  { key: "windowArticles", label: "Recent Articles", align: "right", cellClass: "is-metric" },
  { key: "allArticles", label: "All-Time Articles", align: "right", cellClass: "is-metric" },
  { key: "fetches", label: "Fetches", align: "right", cellClass: "is-metric" },
  { key: "lastSavedAt", label: "Last Saved", cellClass: "is-timestamp" }
]);

// Column indices for deferred loading (0-indexed, matching DOMAIN_SUMMARY_COLUMNS)
const HOST_COL_INDEX = 1;
const ALL_ARTICLES_COL_INDEX = 3;
const FETCHES_COL_INDEX = 4;

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
    allArticles: formatCountOrLoading(entry.allArticles),
    fetches: formatCountOrLoading(entry.fetches),
    lastSavedAt: formatDateTime(entry.lastSavedAt, true)
  }));
}

class DomainSummaryTableControl extends TableControl {
  constructor(spec = {}) {
    const { columns, rows, entries, startIndex } = spec || {};
    const resolvedColumns = Array.isArray(columns) && columns.length ? columns : buildColumns();
    super({ ...spec, columns: resolvedColumns });
    this.__type_name = "domain_summary_table";
    
    // Add marker attribute for client-side hydration
    this.dom.attributes["data-control"] = "domain-summary-table";
    
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

  /**
   * Client-side activation: loads deferred counts for [loading] cells.
   * This method only runs in the browser after hydration.
   */
  activate() {
    if (this.__active) return;
    this.__active = true;

    const el = this.dom && this.dom.el;
    if (!el) return;

    // Find all loading cells
    const loadingCells = el.querySelectorAll(".is-loading");
    if (loadingCells.length === 0) return;

    // Extract hosts from table rows
    const hosts = this._extractHostsFromTable(el);
    if (hosts.length === 0) return;

    // Fetch deferred counts and update cells
    this._loadDeferredCounts(el, hosts);
  }

  /**
   * Extract host names from table rows.
   * @param {HTMLElement} tableEl - The table element
   * @returns {string[]} Array of host names
   */
  _extractHostsFromTable(tableEl) {
    const hosts = [];
    const rows = tableEl.querySelectorAll("tbody tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length > HOST_COL_INDEX) {
        const hostCell = cells[HOST_COL_INDEX];
        const link = hostCell.querySelector("a");
        const hostText = link ? link.textContent : hostCell.textContent;
        if (hostText && hostText.trim() && hostText !== "—") {
          hosts.push(hostText.trim());
        }
      }
    });
    return hosts;
  }

  /**
   * Fetch deferred counts from the API and update loading cells.
   * @param {HTMLElement} tableEl - The table element
   * @param {string[]} hosts - Array of host names to fetch counts for
   */
  async _loadDeferredCounts(tableEl, hosts) {
    try {
      const response = await fetch(`/api/domains/counts?hosts=${encodeURIComponent(hosts.join(","))}`);
      if (!response.ok) return;

      const data = await response.json();
      if (!data || !data.counts) return;

      // Update table cells with loaded data
      const rows = tableEl.querySelectorAll("tbody tr");
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length <= FETCHES_COL_INDEX) return;

        const hostCell = cells[HOST_COL_INDEX];
        const link = hostCell.querySelector("a");
        const hostText = link ? link.textContent : hostCell.textContent;
        const host = hostText ? hostText.trim() : null;

        if (!host || !data.counts[host]) return;

        const counts = data.counts[host];
        
        // Update allArticles cell
        const allArticlesCell = cells[ALL_ARTICLES_COL_INDEX];
        if (allArticlesCell && allArticlesCell.classList.contains("is-loading")) {
          allArticlesCell.textContent = formatCount(counts.allArticles);
          allArticlesCell.classList.remove("is-loading");
        }

        // Update fetches cell
        const fetchesCell = cells[FETCHES_COL_INDEX];
        if (fetchesCell && fetchesCell.classList.contains("is-loading")) {
          fetchesCell.textContent = formatCount(counts.fetches);
          fetchesCell.classList.remove("is-loading");
        }
      });
    } catch (err) {
      // Silently fail - loading indicators remain visible
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[DomainSummaryTable] Failed to load deferred counts:", err.message);
      }
    }
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
