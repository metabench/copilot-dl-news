"use strict";

/**
 * Pagination Utilities
 * 
 * Functions for building pagination metadata and navigation.
 * 
 * @module src/ui/server/dataExplorer/utils/pagination
 */

const { buildHref } = require("./queryParams");

/**
 * Build pagination metadata
 * @param {string} basePath - Base path for links
 * @param {Object} query - Current query parameters
 * @param {Object} options - Pagination options
 * @param {number} options.totalRows - Total number of rows
 * @param {number} options.pageSize - Page size
 * @param {number} options.currentPage - Current page number
 * @returns {Object} - Pagination metadata
 */
function buildPagination(basePath, query, { totalRows, pageSize, currentPage }) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const offset = (safePage - 1) * pageSize;
  const startRow = totalRows === 0 ? 0 : offset + 1;
  const remaining = Math.max(0, totalRows - offset);
  const endRow = remaining === 0 ? 0 : offset + Math.min(pageSize, remaining);
  const makeHref = (page) => buildHref(basePath, query, page);
  return {
    currentPage: safePage,
    totalPages,
    totalRows,
    pageSize,
    startRow,
    endRow,
    offset,
    prevHref: safePage > 1 ? makeHref(safePage - 1) : null,
    nextHref: safePage < totalPages ? makeHref(safePage + 1) : null,
    firstHref: safePage > 1 ? makeHref(1) : null,
    lastHref: safePage < totalPages ? makeHref(totalPages) : null
  };
}

/**
 * Build URL filter options for client-side toggle
 * @param {Object} params
 * @param {Object} params.req - Express request
 * @param {string} params.basePath - Base path
 * @param {Object} params.filters - Current filter state
 * @param {Object} params.querySnapshot - Query snapshot
 * @returns {Object|null} - Filter options or null
 */
function buildUrlFilterOptions({ req, basePath, filters, querySnapshot }) {
  if (!req || !basePath) return null;
  const apiPath = `${req.baseUrl || ""}/api/urls`;
  return {
    apiPath,
    basePath,
    query: querySnapshot || {},
    hasFetches: !!(filters && filters.hasFetches),
    label: "Show fetched URLs only",
    defaultPage: 1
  };
}

module.exports = {
  buildPagination,
  buildUrlFilterOptions
};
