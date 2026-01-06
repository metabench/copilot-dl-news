"use strict";

/**
 * @module PlaceHubsTable
 * @description Table control for displaying place hubs from news websites.
 * Place hubs are URL patterns that aggregate news about specific geographic locations.
 */

const { TableControl } = require("./Table");
const { buildIndexCell, formatDateTime } = require("./UrlListingTable");

const PLACE_HUB_COLUMNS = Object.freeze([
  { key: "index", label: "#", align: "right", cellClass: "is-index" },
  { key: "host", label: "Host", cellClass: "is-host" },
  { key: "placeSlug", label: "Place", cellClass: "is-slug" },
  { key: "title", label: "Title" },
  { key: "placeKind", label: "Kind", align: "center" },
  { key: "topicLabel", label: "Topic" },
  { key: "navLinks", label: "Nav Links", align: "right", cellClass: "is-metric" },
  { key: "articleLinks", label: "Article Links", align: "right", cellClass: "is-metric" },
  { key: "firstSeen", label: "First Seen", cellClass: "is-timestamp" },
  { key: "lastSeen", label: "Last Seen", cellClass: "is-timestamp" }
]);

function cloneColumn(column) {
  return { ...column };
}

function buildColumns() {
  return PLACE_HUB_COLUMNS.map(cloneColumn);
}

/**
 * Build a styled badge for place kind display
 * @param {string} kind - Place kind (country, city, region, etc.)
 * @returns {object} Badge specification
 */
function buildKindBadge(kind) {
  if (!kind) return "—";
  const normalized = String(kind).toLowerCase();
  let variant = "muted";
  if (normalized === "country") variant = "info";
  else if (normalized === "city") variant = "accent";
  else if (normalized === "region" || normalized === "state") variant = "warn";
  else if (normalized === "continent") variant = "success";
  return { text: kind, classNames: `badge badge--${variant}` };
}

/**
 * Format a count value for display
 * @param {number|null} count - Count value
 * @returns {string} Formatted count
 */
function formatCount(count) {
  if (count == null || !Number.isFinite(count)) return "—";
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * Build display rows from place hub records
 * @param {Array} hubs - Array of place hub records
 * @param {object} options - Options (startIndex)
 * @returns {Array} Display rows for table
 */
function buildRows(hubs = [], options = {}) {
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(1, Math.trunc(options.startIndex)) : 1;
  return hubs.map((hub, index) => {
    const hostDisplay = hub.host || "—";
    return {
      index: buildIndexCell(index, startIndex),
      host: {
        text: hostDisplay,
        href: `/domains/${encodeURIComponent(hostDisplay)}`,
        title: hostDisplay,
        classNames: "is-host"
      },
      placeSlug: hub.place_slug || hub.placeSlug || "—",
      title: hub.title || "—",
      placeKind: buildKindBadge(hub.place_kind || hub.placeKind),
      topicLabel: hub.topic_label || hub.topicLabel || hub.topic_slug || hub.topicSlug || "—",
      navLinks: formatCount(hub.nav_links_count ?? hub.navLinksCount),
      articleLinks: formatCount(hub.article_links_count ?? hub.articleLinksCount),
      firstSeen: formatDateTime(hub.first_seen_at || hub.firstSeenAt, true),
      lastSeen: formatDateTime(hub.last_seen_at || hub.lastSeenAt, true)
    };
  });
}

class PlaceHubsTableControl extends TableControl {
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
  PlaceHubsTableControl,
  buildPlaceHubColumns: buildColumns,
  buildPlaceHubRows: buildRows
};
