'use strict';

/**
 * Hard size limit for bootstrap seed files (owner directive, 2026-07-18).
 *
 * Bootstrap records exist to carry JUDGMENT CALLS (seed rows, class maps,
 * curated defaults) — bulk data belongs in online ingestion (Wikidata,
 * REST sources) where it is fetched, cached and idempotently upserted.
 * A bootstrap file approaching megabytes is a design smell that data is
 * being smuggled around the ingestion pipelines, so the limit THROWS
 * rather than warns.
 */

const fs = require('fs');

const MAX_BOOTSTRAP_BYTES = 10 * 1024 * 1024; // 10MB hard limit

/**
 * Read + parse a bootstrap JSON file, enforcing the size limit.
 *
 * @param {string} filePath - Absolute path to the bootstrap file.
 * @param {Object} [options]
 * @param {number} [options.maxBytes] - Override for tests only.
 * @returns {any|null} Parsed JSON, or null when the file does not exist.
 * @throws {Error} When the file exceeds the hard limit or is invalid JSON.
 */
function readBootstrapJson(filePath, { maxBytes = MAX_BOOTSTRAP_BYTES } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const { size } = fs.statSync(filePath);
  if (size > maxBytes) {
    throw new Error(
      `bootstrap file exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB hard limit: ` +
      `${filePath} is ${size} bytes. Bootstrap records are for judgment-call seeds; ` +
      'bulk data belongs in online ingestion.'
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

module.exports = { MAX_BOOTSTRAP_BYTES, readBootstrapJson };
