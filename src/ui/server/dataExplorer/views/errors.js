"use strict";

/**
 * Error Log View Renderer
 * 
 * Renders the recent errors view.
 * 
 * @module src/ui/server/dataExplorer/views/errors
 */

const { formatDateTime } = require("../utils/formatting");
const { listRecentErrors } = require("../../../../db/sqlite/v1/queries/ui/errors");
const {
  buildErrorLogColumns,
  buildErrorLogRows
} = require("../../../controls/ErrorLogTable");
const { buildBackLinkTarget } = require("../../navigation");

// Import shared utilities (DRY)
const { attachBackLinks, ERROR_LIMIT } = require("./shared");

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
    ? `No recent errors recorded in ${relativeDb}`
    : `Latest ${rows.length} error rows captured from ${relativeDb}`;
  return {
    title: "Recent Crawl Errors",
    columns: buildErrorLogColumns(),
    rows,
    meta: {
      rowCount: rows.length,
      limit: ERROR_LIMIT,
      dbLabel: relativeDb,
      generatedAt: formatDateTime(now, true),
      subtitle
    }
  };
}

module.exports = {
  renderErrorLogView,
  // Re-export from shared for backward compatibility
  ERROR_LIMIT
};
