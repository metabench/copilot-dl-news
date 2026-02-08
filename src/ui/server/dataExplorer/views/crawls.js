"use strict";

/**
 * Crawl Jobs View Renderer
 * 
 * Renders the recent crawl jobs view.
 * 
 * @module src/ui/server/dataExplorer/views/crawls
 */

const { listRecentCrawls } = require("../../../../data/db/sqlite/v1/queries/ui/crawls");
const {
  buildCrawlJobColumns,
  buildCrawlJobRows
} = require("../../../controls/CrawlJobsTable");

// Import shared constants (DRY)
const { CRAWL_LIMIT, buildViewMeta } = require("./shared");

/**
 * Render crawl jobs view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderCrawlJobsView({ db, relativeDb, now }) {
  const crawls = listRecentCrawls(db, { limit: CRAWL_LIMIT });
  const rows = buildCrawlJobRows(crawls);
  const subtitle = rows.length === 0
    ? `No crawl jobs recorded in ${relativeDb}`
    : `Most recent ${rows.length} crawl jobs recorded in ${relativeDb}`;
  return {
    title: "Recent Crawl Jobs",
    columns: buildCrawlJobColumns(),
    rows,
    meta: buildViewMeta({
      rowCount: rows.length,
      limit: CRAWL_LIMIT,
      relativeDb,
      now,
      subtitle
    })
  };
}

module.exports = {
  renderCrawlJobsView,
  // Re-export from shared for backward compatibility
  CRAWL_LIMIT
};
