"use strict";

/**
 * Configuration View Renderer
 * 
 * Renders the configuration settings view.
 * 
 * @module src/ui/server/dataExplorer/views/config
 */

const { formatDateTime } = require('../../utils/formatting");
const { listConfiguration } = require('../../../../data/db/sqlite/v1/queries/ui/configuration");
const { ConfigMatrixControl } = require("../../../controls/ConfigMatrixControl");
const { buildViewMeta } = require("./shared");

/**
 * Render the configuration view
 * @param {Object} params
 * @returns {Object} - View payload
 */
function renderConfigView({ db, relativeDb, now }) {
  const settings = listConfiguration(db);
  const properties = settings.map((row) => ({
    key: row.key,
    value: row.value,
    source: "crawler_settings",
    description: `Last updated: ${formatDateTime(row.updatedAt, true)}`,
    edit: {
      action: "/api/config",
      method: "post",
      keyField: "key",
      valueField: "value",
      label: "Save",
      placeholder: row.value,
      key: row.key
    }
  }));

  const control = new ConfigMatrixControl({
    sections: [
      {
        title: "Crawler Settings",
        description: "Configuration values stored in the database.",
        properties
      }
    ]
  });

  return {
    title: "Configuration",
    columns: [],
    rows: [],
    meta: buildViewMeta({
      rowCount: settings.length,
      limit: settings.length,
      relativeDb,
      now,
      subtitle: `${settings.length} settings loaded from ${relativeDb}`
    }),
    renderOptions: {
      layoutMode: "single-control",
      mainControl: control
    }
  };
}

module.exports = {
  renderConfigView
};
