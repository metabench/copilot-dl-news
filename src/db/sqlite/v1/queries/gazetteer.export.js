'use strict';

/**
 * Gazetteer Export Module
 *
 * Provides utilities for exporting gazetteer data.
 */

const fs = require('fs');
const path = require('path');

/**
 * Export gazetteer tables to NDJSON files
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} options - Export options
 * @param {string} options.outputDir - Output directory for NDJSON files
 * @param {Array<string>|null} options.tables - Tables to export (null for all)
 * @returns {object} Export results { exportedTables, totalRecords }
 */
function exportGazetteerTables(db, options = {}) {
  const { outputDir = './gazetteer-backup', tables = null } = options;

  // Core gazetteer tables to export
  const GAZETTEER_TABLES = [
    'places',
    'place_names',
    'place_hierarchy',
    'place_attributes',
    'place_attribute_values',
    'place_external_ids',
    'place_hubs',
    'place_hub_unknown_terms',
    'place_provenance',
    'place_sources'
  ];

  const tablesToExport = tables || GAZETTEER_TABLES;
  const exportedTables = [];
  let totalRecords = 0;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const tableName of tablesToExport) {
    // Check if table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name = ?
    `).get(tableName);

    if (!tableExists) {
      continue;
    }

    const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get().count;
    const stmt = db.prepare(`SELECT * FROM ${tableName}`);

    const outputPath = path.join(outputDir, `${tableName}.ndjson`);
    const writeStream = fs.createWriteStream(outputPath);

    for (const row of stmt.iterate()) {
      writeStream.write(JSON.stringify(row) + '\n');
    }

    writeStream.end();

    exportedTables.push({ tableName, recordCount: count, outputPath });
    totalRecords += count;
  }

  return { exportedTables, totalRecords };
}

module.exports = {
  exportGazetteerTables
};