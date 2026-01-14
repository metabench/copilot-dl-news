"use strict";

/**
 * Error Log View Renderer
 * 
 * Renders the recent errors view.
 * 
 * @module src/ui/server/dataExplorer/views/errors
 */

const { listRecentErrors } = require('../../../../data/db/sqlite/v1/queries/ui/errors");
const {
  buildErrorLogColumns,
  buildErrorLogRows
} = require("../../../controls/ErrorLogTable");
const { buildBackLinkTarget } = require("../../navigation");

// Import shared utilities (DRY)
const {
  attachBackLinks,
  ERROR_LIMIT,
  buildViewMeta,
  buildCountSubtitle,
  buildEmptySubtitle
} = require("./shared");

/**
 * Render error log view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderErrorLogView({ req, db, relativeDb, now }) {
  const errors = listRecentErrors(db, { limit: ERROR_LIMIT });
  const rows = buildErrorLogRows(errors);
  const backTarget = buildBackLinkTarget(req, { defaultLabel: "Errors" });
  attachBackLinks(rows, ["host", "url"], backTarget);
  const subtitle = rows.length === 0
    ? buildEmptySubtitle("recent errors", relativeDb)
    : buildCountSubtitle(rows.length, "error rows", relativeDb);
  return {
    title: "Recent Crawl Errors",
    columns: buildErrorLogColumns(),
    rows,
    meta: buildViewMeta({
      rowCount: rows.length,
      limit: ERROR_LIMIT,
      relativeDb,
      now,
      subtitle
    })
  };
}

module.exports = {
  renderErrorLogView,
  // Re-export from shared for backward compatibility
  ERROR_LIMIT
};
