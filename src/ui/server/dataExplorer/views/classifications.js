"use strict";

/**
 * Classifications View Renderer
 * 
 * Renders the document classifications view.
 * 
 * @module src/ui/server/dataExplorer/views/classifications
 */

const { formatCount } = require("../utils/formatting");
const { buildViewMeta } = require("./shared");
const { listClassificationsWithCounts } = require("../../../../db/sqlite/v1/queries/ui/classificationTypes");

/**
 * Build table columns for classification types listing
 * @returns {Array} - Column definitions
 */
function buildClassificationColumns() {
  return [
    { key: "emoji", label: "Type", width: "80px", align: "center" },
    { key: "display_name", label: "Classification", sortable: true },
    { key: "category", label: "Category", width: "120px" },
    { key: "document_count", label: "Documents", width: "120px", align: "right", sortable: true },
    { key: "description", label: "Description" }
  ];
}

/**
 * Build display rows for classification types
 * @param {Array} classifications - Classification records
 * @returns {Array} - Display rows
 */
function buildClassificationRows(classifications) {
  return classifications.map((c) => ({
    emoji: c.emoji || "❓",
    display_name: {
      text: c.display_name || c.name,
      href: `/classifications/${encodeURIComponent(c.name)}`
    },
    category: c.category || "—",
    document_count: formatCount(c.document_count || 0),
    description: c.description || "—"
  }));
}

/**
 * Render the classification types listing view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderClassificationsView({ db, relativeDb, now }) {
  const classifications = listClassificationsWithCounts(db);
  const totalDocs = classifications.reduce((sum, c) => sum + (c.document_count || 0), 0);
  const usedCount = classifications.filter(c => c.document_count > 0).length;
  
  const subtitle = classifications.length === 0
    ? `No classification types defined in ${relativeDb}`
    : `${classifications.length} classification types (${usedCount} in use) covering ${formatCount(totalDocs)} documents`;
  
  return {
    title: "Document Classifications",
    columns: buildClassificationColumns(),
    rows: buildClassificationRows(classifications),
    meta: buildViewMeta({
      rowCount: classifications.length,
      limit: classifications.length,
      relativeDb,
      now,
      subtitle
    })
  };
}

module.exports = {
  buildClassificationColumns,
  buildClassificationRows,
  renderClassificationsView
};
