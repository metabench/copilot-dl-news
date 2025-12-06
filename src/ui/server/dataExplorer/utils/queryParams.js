"use strict";

/**
 * Query Parameter Utilities
 * 
 * Functions for parsing, sanitizing, and building query parameters.
 * 
 * @module src/ui/server/dataExplorer/utils/queryParams
 */

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 2000;

const TRUTHY_QUERY_VALUES = new Set(["1", "true", "t", "yes", "on", "only"]);
const FALSY_QUERY_VALUES = new Set(["0", "false", "f", "no", "off"]);

/**
 * Sanitize page number from query parameter
 * @param {*} value - Raw page value
 * @returns {number} - Valid page number (>= 1)
 */
function sanitizePage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.trunc(numeric);
}

/**
 * Sanitize page size from query parameter
 * @param {*} value - Raw page size value
 * @param {Object} [options] - Options
 * @param {number} [options.defaultPageSize] - Default page size
 * @param {number} [options.maxPageSize] - Maximum page size
 * @returns {number} - Valid page size
 */
function sanitizePageSize(value, options = {}) {
  const defaultSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxSize = options.maxPageSize ?? MAX_PAGE_SIZE;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultSize;
  return Math.min(maxSize, Math.max(10, Math.trunc(numeric)));
}

/**
 * Convert a query parameter value to a boolean
 * Handles arrays, strings, numbers, and booleans
 * @param {*} value - Query parameter value
 * @returns {boolean}
 */
function toBooleanQueryFlag(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const resolved = toBooleanQueryFlag(value[i]);
      if (resolved !== undefined) return resolved;
    }
    return false;
  }
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (TRUTHY_QUERY_VALUES.has(normalized)) return true;
    if (FALSY_QUERY_VALUES.has(normalized)) return false;
    return true;
  }
  return Boolean(value);
}

/**
 * Resolve URL filter state from query parameters
 * @param {Object} query - Express query object
 * @returns {Object} - Filter state
 */
function resolveUrlFilterState(query = {}) {
  return {
    hasFetches: toBooleanQueryFlag(query.hasFetches)
  };
}

/**
 * Create a snapshot of query parameters as strings
 * @param {Object} query - Express query object
 * @returns {Object} - Normalized query snapshot
 */
function snapshotQueryParams(query = {}) {
  const result = {};
  Object.entries(query || {}).forEach(([key, rawValue]) => {
    if (rawValue == null) return;
    if (Array.isArray(rawValue)) {
      const values = rawValue
        .map((value) => (value == null ? null : String(value)))
        .filter((value) => value != null);
      if (values.length) {
        result[key] = values;
      }
      return;
    }
    result[key] = String(rawValue);
  });
  return result;
}

/**
 * Build href with query parameters
 * @param {string} basePath - Base path
 * @param {Object} query - Query parameters
 * @param {number} targetPage - Target page number
 * @returns {string} - Full URL with query string
 */
function buildHref(basePath, query, targetPage) {
  const params = new URLSearchParams();
  const entries = query && typeof query === "object" ? Object.entries(query) : [];
  entries.forEach(([key, rawValue]) => {
    if (key === "page" || rawValue == null) return;
    const value = Array.isArray(rawValue) ? rawValue : [rawValue];
    value.filter((v) => v != null && v !== "").forEach((v) => params.append(key, String(v)));
  });
  if (targetPage > 1) {
    params.set("page", String(targetPage));
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  sanitizePage,
  sanitizePageSize,
  toBooleanQueryFlag,
  resolveUrlFilterState,
  snapshotQueryParams,
  buildHref
};
