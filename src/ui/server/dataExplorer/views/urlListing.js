"use strict";

/**
 * URL Listing View Renderer
 * 
 * Renders the URL listing view with pagination and filter options.
 * 
 * @module src/ui/server/dataExplorer/views/urlListing
 */

const { formatDateTime, formatCount } = require('../../utils/formatting");
const { sanitizePage, resolveUrlFilterState, snapshotQueryParams } = require('../../utils/queryParams");
const { buildPagination, buildUrlFilterOptions } = require('../../utils/pagination");
const {
  selectUrlPage,
  selectFetchedUrlPage
} = require('../../../../data/db/sqlite/v1/queries/ui/urlListingNormalized");
const {
  buildColumns,
  buildDisplayRows
} = require("../../../controls/UrlListingTable");
const { buildBackLinkTarget } = require("../../navigation");

// Import shared utilities (DRY)
const {
  attachBackLinks,
  buildUrlTotals,
  buildViewMeta
} = require("./shared");

/**
 * Build URL summary subtitle
 * @param {Object} params
 * @returns {string} - Subtitle text
 */
function buildUrlSummarySubtitle({ startRow, endRow, totalRows, currentPage, totalPages, totals, filters }) {
  const normalize = (value, fallback = 1) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(fallback, Math.trunc(value));
  };
  const safeStart = normalize(startRow, 1);
  const safeEnd = normalize(endRow, safeStart);
  const safeTotal = normalize(totalRows, safeEnd);
  const safePage = normalize(currentPage, 1);
  const safeTotalPages = normalize(totalPages, safePage);
  const parts = [
    `Rows ${formatCount(safeStart)}-${formatCount(safeEnd)} of ${formatCount(safeTotal)}`,
    `Page ${safePage} of ${safeTotalPages}`
  ];
  if (totals && totals.source) {
    const freshness = totals.cache && totals.cache.generatedAt
      ? formatDateTime(totals.cache.generatedAt, true)
      : null;
    const sourceLabel = totals.source === "cache" ? "cached" : totals.source;
    parts.push(freshness ? `${sourceLabel} metric as of ${freshness}` : `${sourceLabel} metric`);
  }
  if (filters && filters.hasFetches) {
    parts.push("Fetched URLs only");
  }
  return parts.join(" • ");
}

/**
 * Build metadata for URL listing response
 * @param {Object} params
 * @returns {Object} - Enhanced metadata
 */
function buildUrlMeta({ meta, totals, now }) {
  const payload = { ...meta };
  if (totals && totals.cache) {
    payload.metrics = {
      ...(payload.metrics || {}),
      urlsTotalCount: {
        statKey: totals.cache.statKey,
        generatedAt: totals.cache.generatedAt,
        stale: totals.cache.stale,
        maxAgeMs: totals.cache.maxAgeMs,
        source: totals.source
      }
    };
  }
  if (!payload.generatedAt && now) {
    payload.generatedAt = formatDateTime(now, true);
  }
  return payload;
}

const URL_COLUMNS = buildColumns();

/**
 * Build URL listing payload from request
 * @param {Object} params
 * @returns {Object} - Payload with rows, filters, pagination, etc.
 */
function buildUrlListingPayload({ req, db, relativeDb, pageSize, now, basePathOverride }) {
  if (!req || !db) {
    throw new Error("buildUrlListingPayload requires an express request and database handle");
  }
  const query = req.query || {};
  const filters = resolveUrlFilterState(query);
  const totals = buildUrlTotals(db, { hasFetches: filters.hasFetches });
  const requestedPage = sanitizePage(query.page);
  const basePath = basePathOverride || (((req.baseUrl || "") + (req.path || "")) || "/urls");
  const querySnapshot = snapshotQueryParams(query);
  const pagination = buildPagination(basePath, query, {
    totalRows: totals.totalRows,
    pageSize,
    currentPage: requestedPage
  });
  const selector = filters.hasFetches ? selectFetchedUrlPage : selectUrlPage;
  const records = selector(db, { limit: pageSize, offset: pagination.offset });
  const rows = buildDisplayRows(records, { startIndex: pagination.startRow > 0 ? pagination.startRow : 1 });
  const subtitle = totals.totalRows === 0
    ? filters.hasFetches
      ? `No fetched URLs available in ${relativeDb}`
      : `No URLs available in ${relativeDb}`
    : buildUrlSummarySubtitle({
      startRow: pagination.startRow,
      endRow: pagination.endRow,
      totalRows: totals.totalRows,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totals,
      filters
    });
  const meta = {
    ...buildViewMeta({
      rowCount: rows.length,
      limit: pageSize,
      relativeDb,
      now,
      subtitle,
      extra: {
        pagination,
        filters: { ...filters }
      }
    })
  };
  return {
    rows,
    records,
    filters,
    totals,
    meta,
    pagination,
    basePath,
    query: querySnapshot
  };
}

/**
 * Render URL listing view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderUrlListingView({ req, db, relativeDb, pageSize, now }) {
  const { rows, totals, meta, filters, basePath, query, records } = buildUrlListingPayload({ req, db, relativeDb, pageSize, now });
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "URLs" });
  attachBackLinks(rows, ["url", "host"], backTarget);
  const decoratedMeta = buildUrlMeta({
    meta,
    totals,
    now
  });
  const filterOptions = buildUrlFilterOptions({
    req,
    basePath,
    filters,
    querySnapshot: query
  });
  const listingState = {
    ok: true,
    columns: URL_COLUMNS,
    rows,
    meta: decoratedMeta,
    filters,
    totals,
    records,
    query,
    basePath
  };
  return {
    title: "Crawler URL Snapshot",
    columns: URL_COLUMNS,
    rows,
    meta: decoratedMeta,
    renderOptions: {
      filterOptions,
      listingState
    }
  };
}

module.exports = {
  // Re-export shared utilities for backward compatibility
  attachBackLink: require("./shared").attachBackLink,
  tryGetCachedUrlTotals: require("./shared").tryGetCachedUrlTotals,
  buildUrlTotals,
  buildUrlSummarySubtitle,
  buildUrlMeta,
  buildUrlListingPayload,
  renderUrlListingView,
  URL_COLUMNS
};
