'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load Domain-Specific XPath Libraries (DXPLs) from disk.
 *
 * Each DXPL file contains XPath patterns learned for article extraction
 * from a specific domain, enabling fast extraction without DOM parsing.
 *
 * @param {object} options
 * @param {string} options.dxplDir - Directory containing DXPL JSON files.
 * @param {Console} [options.logger=console] - Logger instance.
 * @returns {Map<string, object>} Map of domain to DXPL entry.
 */
function loadDxplLibrary({ dxplDir, logger = console } = {}) {
  const dxpls = new Map();

  if (!dxplDir || !fs.existsSync(dxplDir)) {
    logger?.log?.(`[dxpl] DXPL directory not found: ${dxplDir}`);
    return dxpls;
  }

  const files = fs.readdirSync(dxplDir).filter((file) => file.endsWith('.json'));
  logger?.log?.(`[dxpl] Found ${files.length} DXPL file(s) in ${dxplDir}`);

  for (const file of files) {
    const filePath = path.join(dxplDir, file);
    try {
      const contents = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(contents);
      for (const [domain, entry] of Object.entries(data)) {
        dxpls.set(domain, entry);
        dxpls.set(`www.${domain}`, entry);
      }
    } catch (error) {
      logger?.error?.(`[dxpl] Failed to load DXPL ${file}: ${error.message}`);
    }
  }

  return dxpls;
}

/**
 * Retrieve DXPL metadata for a given domain (handles www. prefix).
 *
 * @param {Map<string, object>} dxplMap - DXPL library map.
 * @param {string} domain - Hostname to look up.
 * @returns {object|null} DXPL entry or null when not available.
 */
function getDxplForDomain(dxplMap, domain) {
  if (!domain || !dxplMap) return null;
  const normalized = String(domain).toLowerCase();
  return dxplMap.get(normalized) || dxplMap.get(normalized.replace(/^www\./, '')) || null;
}

/**
 * Extract domain from URL for DXPL lookup.
 *
 * @param {string} url - Full URL
 * @returns {string|null} Domain or null if invalid URL
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return null;
  }
}

module.exports = {
  loadDxplLibrary,
  getDxplForDomain,
  extractDomain
};