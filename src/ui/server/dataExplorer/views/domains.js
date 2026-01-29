"use strict";

/**
 * Domain Views Renderer
 * 
 * Renders domain summary and domain detail views.
 * 
 * @module src/ui/server/dataExplorer/views/domains
 */

const { formatDateTime, formatCount } = require('../../utils/formatting");
const { buildDomainSnapshot } = require("../../../homeCardData");
const {
  buildDomainSummaryColumns,
  buildDomainSummaryRows
} = require("../../../controls/DomainSummaryTable");
const { buildBackLinkTarget } = require("../../navigation");

// Import shared utilities (DRY)
const {
  attachBackLink,
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT,
  buildViewMeta
} = require("./shared");

/**
 * Build domain summary subtitle
 * @param {number} rowCount - Number of rows
 * @param {Object} snapshot - Domain snapshot with cache info
 * @returns {string} - Subtitle text
 */
function buildDomainSubtitle(rowCount, snapshot) {
  const base = `Top ${rowCount} hosts derived from the last ${formatCount(DOMAIN_WINDOW_SIZE)} saved articles`;
  if (!snapshot.cache) return base;
  const updatedText = snapshot.cache.generatedAt
    ? `cache ${snapshot.cache.stale ? "stale" : "updated"} ${formatDateTime(snapshot.cache.generatedAt, true)}`
    : "cache data";
  return `${base} · ${updatedText}`;
}

/**
 * Render domain summary view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderDomainSummaryView({ req, db, relativeDb, now }) {
  const snapshot = buildDomainSnapshot(db, { windowSize: DOMAIN_WINDOW_SIZE, limit: DOMAIN_LIMIT });
  // Skip slow per-host queries (getArticleCount, getFetchCountForHost) on initial render.
  // These would cause N+1 queries that take several seconds. Instead, render placeholders
  // and let the client load these counts asynchronously in the future.
  const entries = snapshot.hosts.map((domain) => {
    return {
      host: domain.host || null,
      windowArticles: domain.articleCount || 0,
      allArticles: null,  // Deferred: would be getArticleCount(db, host)
      fetches: null,      // Deferred: would be getFetchCountForHost(db, host)
      lastSavedAt: domain.lastSavedAt
    };
  });
  const rows = buildDomainSummaryRows(entries);
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "Domains" });
  attachBackLink(rows, "host", backTarget);
  const subtitle = rows.length === 0
    ? `No recent domain saves found in ${relativeDb}`
    : buildDomainSubtitle(rows.length, snapshot);
  const metrics = snapshot.cache
    ? {
        statKey: snapshot.cache.statKey,
        generatedAt: snapshot.cache.generatedAt,
        stale: snapshot.cache.stale,
        maxAgeMs: snapshot.cache.maxAgeMs,
        source: snapshot.source
      }
    : undefined;
  return {
    title: "Recent Domain Activity",
    columns: buildDomainSummaryColumns(),
    rows,
    meta: buildViewMeta({
      rowCount: rows.length,
      limit: DOMAIN_LIMIT,
      relativeDb,
      now,
      subtitle,
      extra: metrics ? { metrics } : {}
    })
  };
}

module.exports = {
  attachBackLink,
  buildDomainSubtitle,
  renderDomainSummaryView,
  // Constants
  DOMAIN_WINDOW_SIZE,
  DOMAIN_LIMIT
};
