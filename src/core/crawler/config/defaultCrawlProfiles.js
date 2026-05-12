'use strict';

/**
 * defaultCrawlProfiles.js — Single source of truth for sensible CLI crawl defaults.
 *
 * Why this exists:
 *   Engine defaults in CrawlerConfigNormalizer.js (e.g. concurrency=1, maxDepth=3)
 *   are conservative for safety. The various CLIs (crawl-batch.js, crawl-remote.js,
 *   tools/crawl/run.js) have historically each carried their own slightly different
 *   defaults. This file is the **one place** to tune the defaults that operators
 *   see when they run a crawl from the command line, so they can never drift apart.
 *
 *   Engine constructor defaults remain unchanged; this layer is opt-in for callers.
 *
 * Profiles:
 *   - 'safe'   (default) — moderate concurrency, bounded download cap, sensible
 *                          per-host pacing. Good first choice for ad-hoc crawls.
 *   - 'fast'             — higher concurrency, larger cap. Use when target sites
 *                          are known-friendly and you want throughput.
 *   - 'gentle'           — single-worker, slow rate, conservative cap. Use against
 *                          rate-limited or fragile sites.
 *
 * Consumers MUST treat returned objects as read-only (frozen).
 */

const PROFILES = Object.freeze({
  safe: Object.freeze({
    name: 'safe',
    description: 'Balanced defaults for ad-hoc crawls (moderate concurrency, bounded cap).',
    // Per-job overrides (sent in the v1 API "overrides" body)
    overrides: Object.freeze({
      maxPages: 1000,
      maxDownloads: 1000,
      maxDepth: 4,
      concurrency: 3,
      requestTimeoutMs: 15000,
      retryLimit: 3,
      backoffBaseMs: 750,
      backoffMaxMs: 5 * 60 * 1000
    }),
    // Batch-level (parallel job fan-out across multiple seed URLs)
    batch: Object.freeze({
      concurrency: 5,
      retries: 2,
      retryDelayMs: 1500,
      operation: 'basicArticleCrawl'
    })
  }),
  fast: Object.freeze({
    name: 'fast',
    description: 'Higher throughput; use for known-friendly targets.',
    overrides: Object.freeze({
      maxPages: 2000,
      maxDownloads: 2000,
      maxDepth: 5,
      concurrency: 6,
      requestTimeoutMs: 15000,
      retryLimit: 3,
      backoffBaseMs: 500,
      backoffMaxMs: 5 * 60 * 1000
    }),
    batch: Object.freeze({
      concurrency: 8,
      retries: 2,
      retryDelayMs: 1000,
      operation: 'basicArticleCrawl'
    })
  }),
  gentle: Object.freeze({
    name: 'gentle',
    description: 'Single worker, slow pace; use for rate-limited or fragile sites.',
    overrides: Object.freeze({
      maxPages: 250,
      maxDownloads: 250,
      maxDepth: 3,
      concurrency: 1,
      requestTimeoutMs: 20000,
      retryLimit: 4,
      backoffBaseMs: 2000,
      backoffMaxMs: 10 * 60 * 1000,
      slowMode: true
    }),
    batch: Object.freeze({
      concurrency: 2,
      retries: 3,
      retryDelayMs: 3000,
      operation: 'basicArticleCrawl'
    })
  })
});

const DEFAULT_PROFILE_NAME = 'safe';

/**
 * Return a frozen profile object by name.
 * Falls back to the safe profile for unknown names.
 *
 * @param {string} [name='safe'] - One of: 'safe', 'fast', 'gentle'.
 * @returns {{ name: string, description: string, overrides: object, batch: object }}
 */
function getDefaultCrawlProfile(name = DEFAULT_PROFILE_NAME) {
  const key = String(name || DEFAULT_PROFILE_NAME).toLowerCase();
  return PROFILES[key] || PROFILES[DEFAULT_PROFILE_NAME];
}

/**
 * List all known profile names.
 * @returns {string[]}
 */
function listProfileNames() {
  return Object.keys(PROFILES);
}

/**
 * Merge user overrides on top of a profile's overrides, returning a plain
 * (non-frozen) object suitable for the v1 API "overrides" body.
 *
 * @param {string} profileName
 * @param {Object} [userOverrides] - User-supplied overrides (win over profile).
 * @returns {Object} Plain object ready to ship as overrides.
 */
function buildOverrides(profileName, userOverrides = {}) {
  const profile = getDefaultCrawlProfile(profileName);
  return Object.assign({}, profile.overrides, userOverrides || {});
}

module.exports = {
  DEFAULT_PROFILE_NAME,
  PROFILES,
  getDefaultCrawlProfile,
  listProfileNames,
  buildOverrides
};
