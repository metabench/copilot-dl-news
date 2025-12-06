"use strict";

/**
 * Formatting Utilities
 * 
 * Functions for formatting values for display.
 * 
 * @module src/ui/server/dataExplorer/utils/formatting
 */

const { formatDateTime, formatCount } = require("../../../controls/UrlListingTable");

/**
 * Format a stat value with fallback
 * @param {*} value - Value to format
 * @returns {string} - Formatted value or em-dash
 */
function formatStatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "—";
  return formatCount(numeric);
}

/**
 * Format an optional date value
 * @param {*} value - Date value
 * @returns {string|null} - Formatted date or null
 */
function formatOptionalDate(value) {
  if (!value) return null;
  const formatted = formatDateTime(value, true);
  return formatted && formatted !== "—" ? formatted : null;
}

/**
 * Build hourly sparkline data from fetch records
 * @param {Array} fetches - Fetch records
 * @param {Object} options - Options
 * @param {number} [options.bucketCount=24] - Number of buckets
 * @param {number} [options.bucketMs=3600000] - Bucket size in ms
 * @param {number} [options.nowMs] - Reference timestamp
 * @returns {number[]} - Series of counts per bucket
 */
function buildHourlySparkline(fetches, { bucketCount = 24, bucketMs = 60 * 60 * 1000, nowMs } = {}) {
  const count = Number.isFinite(bucketCount) && bucketCount > 0 ? Math.trunc(bucketCount) : 24;
  const interval = Number.isFinite(bucketMs) && bucketMs > 0 ? bucketMs : 60 * 60 * 1000;
  const reference = Number.isFinite(nowMs) ? nowMs : Date.now();
  const series = new Array(count).fill(0);
  if (!Array.isArray(fetches) || fetches.length === 0) {
    return series;
  }
  fetches.forEach((entry) => {
    const rawTs = entry && (entry.fetchedAt || entry.requestedAt || entry.fetched_at || entry.request_started_at);
    const ts = rawTs ? Date.parse(rawTs) : Number(entry && entry.timestamp);
    if (!Number.isFinite(ts)) return;
    const age = reference - ts;
    const bucketIndex = Math.floor(age / interval);
    if (bucketIndex >= 0 && bucketIndex < count) {
      const mappedIndex = count - 1 - bucketIndex;
      if (mappedIndex >= 0 && mappedIndex < count) {
        series[mappedIndex] += 1;
      }
    }
  });
  return series;
}

/**
 * Normalize a host string to lowercase
 * @param {string} host - Host string
 * @returns {string|null} - Lowercase host or null
 */
function toLowerHost(host) {
  if (!host) return null;
  return String(host).toLowerCase();
}

module.exports = {
  formatStatValue,
  formatOptionalDate,
  buildHourlySparkline,
  toLowerHost,
  // Re-export from UrlListingTable for convenience
  formatDateTime,
  formatCount
};
