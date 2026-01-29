"use strict";

/**
 * Shared View Utilities
 * 
 * Common functions and constants used across multiple view modules.
 * Centralizes DRY patterns to avoid duplication.
 * 
 * @module src/ui/server/dataExplorer/views/shared
 */

const { formatDateTime, formatCount } = require('../../utils/formatting");
const { getCachedMetric } = require("../../services/metricsService");
const { countUrls, countFetchedUrls } = require('../../../../data/db/sqlite/v1/queries/ui/urlListingNormalized");
const { appendBackParams } = require("../../navigation");

// ============================================================================
// Shared Constants
// ============================================================================

/** Number of recent articles to consider for domain window */
const DOMAIN_WINDOW_SIZE = 4000;

/** Maximum domains to show in summary views */
const DOMAIN_LIMIT = 40;

/** Crawl jobs limit for home cards */
const HOME_CARD_CRAWL_LIMIT = 12;

/** Error limit for home cards */
const HOME_CARD_ERROR_LIMIT = 50;

/** Crawl jobs limit for full view */
const CRAWL_LIMIT = 80;

/** Error log limit for full view */
const ERROR_LIMIT = 200;

/** Domain downloads limit for detail view */
const DOMAIN_DOWNLOAD_LIMIT = 200;

// ============================================================================
// Shared Row Utilities
// ============================================================================

/**
 * Attach back link parameters to row cell hrefs.
 * Modifies rows in-place for cells that have href properties.
 * 
 * @param {Array} rows - Display rows to decorate
 * @param {string} key - Column key to decorate (e.g., "url", "host")
 * @param {Object} backLink - Back link target object with href property
 * @returns {Array} - Modified rows (same reference)
 */
function attachBackLink(rows, key, backLink) {
  if (!Array.isArray(rows) || !backLink || !backLink.href) return rows;
  rows.forEach((row) => {
    if (!row) return;
    const cell = row[key];
    if (cell && typeof cell === "object" && cell.href) {
      cell.href = appendBackParams(cell.href, backLink);
    }
  });
  return rows;
}

/**
 * Attach back links to multiple keys in one call.
 * Convenience wrapper for common patterns like attaching to both "url" and "host".
 * 
 * @param {Array} rows - Display rows to decorate
 * @param {string[]} keys - Column keys to decorate
 * @param {Object} backLink - Back link target object
 * @returns {Array} - Modified rows
 */
function attachBackLinks(rows, keys, backLink) {
  if (!Array.isArray(keys)) return rows;
  keys.forEach((key) => attachBackLink(rows, key, backLink));
  return rows;
}

// ============================================================================
// Shared URL Totals Utilities
// ============================================================================

/**
 * Try to get cached URL totals from metrics service.
 * Returns null if cache is unavailable or invalid.
 * 
 * @param {Object} db - Database connection
 * @returns {Object|null} - Cached totals with source/cache metadata, or null
 */
function tryGetCachedUrlTotals(db) {
  if (!db) return null;
  try {
    const cached = getCachedMetric(db, "urls.total_count");
    if (cached && cached.payload && Number.isFinite(Number(cached.payload.value))) {
      return {
        source: "cache",
        totalRows: Number(cached.payload.value) || 0,
        cache: {
          statKey: cached.statKey,
          generatedAt: cached.generatedAt,
          stale: cached.stale,
          maxAgeMs: cached.maxAgeMs
        }
      };
    }
  } catch (_) {
    // cache read failures fall back to live count
  }
  return null;
}

/**
 * Build URL totals with caching support.
 * Prefers cached metrics when available, falls back to live count.
 * 
 * @param {Object} db - Database connection
 * @param {Object} [options={}] - Options
 * @param {boolean} [options.hasFetches] - Filter to fetched URLs only (bypasses cache)
 * @returns {Object} - Totals object with source, totalRows, and cache metadata
 */
function buildUrlTotals(db, options = {}) {
  if (options.hasFetches) {
    return {
      source: "live",
      totalRows: countFetchedUrls(db),
      cache: null
    };
  }
  const cached = tryGetCachedUrlTotals(db);
  if (cached) {
    return cached;
  }
  return {
    source: "live",
    totalRows: countUrls(db),
    cache: null
  };
}

// ============================================================================
// Shared View Meta Builders
// ============================================================================

/**
 * Build standard view metadata object.
 * Provides consistent structure for all view responses.
 * 
 * @param {Object} params
 * @param {number} params.rowCount - Number of rows in response
 * @param {number} params.limit - Limit used for query
 * @param {string} params.relativeDb - Relative database path label
 * @param {Date} params.now - Current timestamp
 * @param {string} params.subtitle - View subtitle text
 * @param {Object} [params.extra] - Additional metadata to merge
 * @returns {Object} - Standardized meta object
 */
function buildViewMeta({ rowCount, limit, relativeDb, now, subtitle, extra = {} }) {
  return {
    rowCount,
    limit,
    dbLabel: relativeDb,
    generatedAt: formatDateTime(now, true),
    subtitle,
    ...extra
  };
}

/**
 * Build empty-state subtitle for a view.
 * Provides consistent "No X found in database" messaging.
 * 
 * @param {string} entityName - Name of the entity (e.g., "URLs", "errors")
 * @param {string} relativeDb - Relative database path label
 * @returns {string} - Empty state subtitle
 */
function buildEmptySubtitle(entityName, relativeDb) {
  return `No ${entityName} recorded in ${relativeDb}`;
}

/**
 * Build row count subtitle for a view.
 * Provides consistent "Latest N items from database" messaging.
 * 
 * @param {number} count - Number of items
 * @param {string} entityName - Name of the entity (e.g., "error rows", "crawl jobs")
 * @param {string} relativeDb - Relative database path label
 * @returns {string} - Row count subtitle
 */
function buildCountSubtitle(count, entityName, relativeDb) {
  return `Latest ${count} ${entityName} captured from ${relativeDb}`;
}

module.exports = {
  // Constants
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  HOME_CARD_CRAWL_LIMIT,
  HOME_CARD_ERROR_LIMIT,
  CRAWL_LIMIT,
  ERROR_LIMIT,
  DOMAIN_DOWNLOAD_LIMIT,
  
  // Row utilities
  attachBackLink,
  attachBackLinks,
  
  // URL totals
  tryGetCachedUrlTotals,
  buildUrlTotals,
  
  // Meta builders
  buildViewMeta,
  buildEmptySubtitle,
  buildCountSubtitle
};
