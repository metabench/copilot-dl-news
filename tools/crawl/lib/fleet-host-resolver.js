'use strict';

/**
 * fleet-host-resolver.js
 * ----------------------
 * Resolves the canonical *host* (no port) for the distributed crawl fleet.
 *
 * Resolution order:
 *   1. process.env.FLEET_HOST                    (explicit override)
 *   2. tools/crawl/.fleet-host                   (1-line file override, gitignored by convention)
 *   3. DEFAULT_FLEET_HOST = '141.144.193.218'    (Oracle Cloud worker VM)
 *
 * Callers append the appropriate port (e.g. ':3200' for the v2 multi-domain
 * server used by simple distributed crawls, ':4700' for docs viewer, ':3300'
 * for legacy services).
 *
 * @module tools/crawl/lib/fleet-host-resolver
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FLEET_HOST = '141.144.193.218';
const HOST_FILE = path.join(__dirname, '..', '.fleet-host');

let cached = null;

/**
 * Synchronously resolve the fleet host (no port).
 * Result is cached for the lifetime of the process.
 * @returns {string} hostname or IP, e.g. '141.144.193.218'
 */
function getFleetHostSync() {
  if (cached) return cached;

  if (process.env.FLEET_HOST && String(process.env.FLEET_HOST).trim()) {
    cached = String(process.env.FLEET_HOST).trim();
    return cached;
  }

  try {
    if (fs.existsSync(HOST_FILE)) {
      const raw = fs.readFileSync(HOST_FILE, 'utf8').trim();
      if (raw) {
        cached = raw.split(/\s+/)[0];
        return cached;
      }
    }
  } catch (_) {
    // ignore — fall back to default
  }

  cached = DEFAULT_FLEET_HOST;
  return cached;
}

/**
 * Reset the cache (test hook).
 */
function _resetCache() {
  cached = null;
}

module.exports = {
  getFleetHostSync,
  DEFAULT_FLEET_HOST,
  _resetCache,
};
