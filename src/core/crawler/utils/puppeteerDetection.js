/**
 * Puppeteer Detection Utility
 * 
 * Determines when Puppeteer should be used instead of simple HTTP fetch.
 * This is important for:
 * - Sites with bot protection (Cloudflare, Akamai, etc.)
 * - JavaScript-rendered SPAs
 * - Sites requiring cookies/authentication flows
 * 
 * Supports both in-memory caching and database persistence for learning.
 * When a database connection is provided, behaviors are persisted across sessions.
 * 
 * @module puppeteerDetection
 */

'use strict';

// Lazy-load database queries to avoid circular dependencies
let dbQueries = null;
let tableEnsured = false;

function getDbQueries() {
  if (!dbQueries) {
    try {
      dbQueries = require('../../../data/db/sqlite/v1/queries/domainCrawlBehaviorsQueries');
    } catch (e) {
      // Queries not available, will use in-memory only
      dbQueries = null;
    }
  }
  return dbQueries;
}

/**
 * Ensure the domain_crawl_behaviors table exists
 * @param {Object} db - Database connection
 */
function ensureDbTable(db) {
  if (!db || tableEnsured) return;
  const queries = getDbQueries();
  if (queries && queries.ensureTable) {
    try {
      queries.ensureTable(db);
      tableEnsured = true;
    } catch (e) {
      // Table creation failed, continue without DB
    }
  }
}

/**
 * Domains that always require Puppeteer due to known bot protection
 */
const ALWAYS_PUPPETEER_DOMAINS = new Set([
  // Add domains here that are known to require JS rendering
  // 'example.com',
]);

/**
 * Domains that should try Puppeteer on 403/captcha responses
 */
const TRY_PUPPETEER_ON_BLOCK = new Set([
  // Most news sites fall into this category
  'www.theguardian.com',
  'www.bbc.com',
  'www.nytimes.com',
  'www.washingtonpost.com',
  'www.reuters.com',
]);

/**
 * In-memory cache of domains that have triggered Puppeteer detection
 * This helps avoid repeated retries on the same domain
 * Format: { domain: { reason, firstSeen, lastSeen, count } }
 */
const puppeteerDomainCache = new Map();

/**
 * Status codes that suggest bot protection is active
 */
const BOT_PROTECTION_STATUS_CODES = new Set([
  403,  // Forbidden (common for bot blocks)
  429,  // Too Many Requests (rate limiting)
  503,  // Service Unavailable (Cloudflare under attack mode)
]);

/**
 * Response headers that indicate bot protection
 */
const BOT_PROTECTION_HEADERS = [
  'cf-mitigated',        // Cloudflare
  'cf-ray',              // Cloudflare (when combined with 403/503)
  'x-akamai-edgescape',  // Akamai
  'x-sucuri-id',         // Sucuri
  'x-cdn',               // Generic CDN that may be protecting
];

/**
 * Body patterns that indicate CAPTCHA or JS challenge
 */
const BOT_PROTECTION_BODY_PATTERNS = [
  /captcha/i,
  /challenge/i,
  /please verify/i,
  /checking your browser/i,
  /cloudflare/i,
  /just a moment/i,
  /enable javascript/i,
  /js challenge/i,
  /ray id/i,  // Cloudflare error pages
];

/**
 * Determine if a domain should use Puppeteer based on previous responses
 * 
 * @param {string} domain - The domain to check
 * @param {Object} [db] - Optional database connection for persistent lookup
 * @returns {{ usePuppeteer: boolean, reason: string|null, confidence: number }}
 */
function shouldUsePuppeteer(domain, db = null) {
  // Check always-Puppeteer list first (highest priority)
  if (ALWAYS_PUPPETEER_DOMAINS.has(domain)) {
    return { usePuppeteer: true, reason: 'known-js-site', confidence: 1.0 };
  }
  
  // Check database if available (persistent learning)
  if (db) {
    ensureDbTable(db);  // Ensure table exists on first DB access
    const queries = getDbQueries();
    if (queries) {
      try {
        const dbResult = queries.checkPuppeteerNeeded(db, domain);
        if (dbResult.needsPuppeteer) {
          return { 
            usePuppeteer: true, 
            reason: dbResult.reason || 'learned-from-db', 
            confidence: dbResult.confidence 
          };
        }
      } catch (e) {
        // DB error, fall through to in-memory cache
      }
    }
  }
  
  // Check in-memory cache (session-only learning)
  const cached = puppeteerDomainCache.get(domain);
  if (cached) {
    return { usePuppeteer: true, reason: cached.reason, confidence: 0.5 };
  }
  
  return { usePuppeteer: false, reason: null, confidence: 0 };
}

/**
 * Analyze a response to determine if Puppeteer is needed
 * 
 * @param {string} domain - The domain
 * @param {number} status - HTTP status code
 * @param {Object} headers - Response headers
 * @param {string} [body] - Response body (optional, for content analysis)
 * @returns {{ needsPuppeteer: boolean, reason: string|null }}
 */
function detectPuppeteerNeeded(domain, status, headers = {}, body = '') {
  // Check status code
  if (BOT_PROTECTION_STATUS_CODES.has(status)) {
    // 403 is a strong signal, but check for bot protection headers to confirm
    const hasBotHeaders = BOT_PROTECTION_HEADERS.some(h => 
      headers[h] !== undefined || headers[h.toLowerCase()] !== undefined
    );
    
    if (hasBotHeaders) {
      return { needsPuppeteer: true, reason: `status-${status}-with-bot-headers` };
    }
    
    // For 403, check if domain is in the try-on-block list
    if (status === 403 && TRY_PUPPETEER_ON_BLOCK.has(domain)) {
      return { needsPuppeteer: true, reason: 'status-403-known-protection' };
    }
  }
  
  // Check body content for CAPTCHA/challenge indicators
  if (body && typeof body === 'string') {
    for (const pattern of BOT_PROTECTION_BODY_PATTERNS) {
      if (pattern.test(body)) {
        return { needsPuppeteer: true, reason: `body-pattern:${pattern.source}` };
      }
    }
  }
  
  return { needsPuppeteer: false, reason: null };
}

/**
 * Record that a domain needs Puppeteer (for future requests)
 * Persists to database if available, otherwise uses in-memory cache.
 * 
 * @param {string} domain - The domain
 * @param {string} reason - Why Puppeteer is needed
 * @param {Object} [options] - Additional options
 * @param {Object} [options.db] - Database connection for persistence
 * @param {Object} [options.detection] - Detection details (hasCloudflare, hasCaptcha, etc.)
 */
function recordPuppeteerNeeded(domain, reason, options = {}) {
  const { db, detection = {} } = options;
  const now = Date.now();
  
  // Always update in-memory cache for immediate use
  const existing = puppeteerDomainCache.get(domain);
  if (existing) {
    existing.lastSeen = now;
    existing.count++;
  } else {
    puppeteerDomainCache.set(domain, {
      reason,
      firstSeen: now,
      lastSeen: now,
      count: 1
    });
  }
  
  // Persist to database if available
  if (db) {
    const queries = getDbQueries();
    if (queries) {
      try {
        queries.recordPuppeteerNeeded(db, domain, reason, detection);
      } catch (e) {
        // DB error, in-memory cache still has the data
      }
    }
  }
}

/**
 * Record a successful HTTP fetch (domain doesn't need Puppeteer)
 * Helps decay Puppeteer confidence over time.
 * 
 * @param {string} domain - The domain
 * @param {Object} [db] - Database connection
 */
function recordHttpSuccess(domain, db = null) {
  if (db) {
    const queries = getDbQueries();
    if (queries) {
      try {
        queries.recordHttpSuccess(db, domain);
      } catch (e) {
        // Ignore DB errors
      }
    }
  }
}

/**
 * Record a successful Puppeteer fetch
 * Reinforces the learning that this domain needs Puppeteer.
 * 
 * @param {string} domain - The domain
 * @param {Object} [db] - Database connection
 */
function recordPuppeteerSuccess(domain, db = null) {
  if (db) {
    const queries = getDbQueries();
    if (queries) {
      try {
        queries.recordPuppeteerSuccess(db, domain);
      } catch (e) {
        // Ignore DB errors
      }
    }
  }
}

/**
 * Clear Puppeteer detection cache for a domain (e.g., after successful non-Puppeteer fetch)
 * 
 * @param {string} domain - The domain to clear
 * @param {Object} [db] - Database connection
 */
function clearPuppeteerCache(domain, db = null) {
  puppeteerDomainCache.delete(domain);
  
  if (db) {
    const queries = getDbQueries();
    if (queries) {
      try {
        queries.clearPuppeteerRequirement(db, domain);
      } catch (e) {
        // Ignore DB errors
      }
    }
  }
}

/**
 * Get all domains currently marked as needing Puppeteer
 * Combines in-memory cache with database records.
 * 
 * @param {Object} [db] - Database connection
 * @returns {Array} List of domains with their reasons
 */
function getPuppeteerDomains(db = null) {
  const result = [];
  
  // Add from in-memory cache
  for (const [domain, data] of puppeteerDomainCache) {
    result.push({
      domain,
      reason: data.reason,
      source: 'memory',
      count: data.count
    });
  }
  
  // Add from database if available
  if (db) {
    const queries = getDbQueries();
    if (queries) {
      try {
        const dbDomains = queries.getPuppeteerDomains(db);
        for (const row of dbDomains) {
          // Check if already in memory results
          if (!result.find(r => r.domain === row.domain)) {
            result.push({
              domain: row.domain,
              reason: row.puppeteer_reason,
              source: 'database',
              count: row.puppeteer_detection_count,
              confidence: row.puppeteer_confidence
            });
          }
        }
      } catch (e) {
        // Ignore DB errors
      }
    }
  }
  
  return result;
}

/**
 * Configure domains that always need Puppeteer
 * 
 * @param {string[]} domains - Array of domain names
 */
function addAlwaysPuppeteerDomains(domains) {
  for (const domain of domains) {
    ALWAYS_PUPPETEER_DOMAINS.add(domain);
  }
}

/**
 * Configure domains to try Puppeteer on 403/block
 * 
 * @param {string[]} domains - Array of domain names
 */
function addTryPuppeteerDomains(domains) {
  for (const domain of domains) {
    TRY_PUPPETEER_ON_BLOCK.add(domain);
  }
}

module.exports = {
  shouldUsePuppeteer,
  detectPuppeteerNeeded,
  recordPuppeteerNeeded,
  recordHttpSuccess,
  recordPuppeteerSuccess,
  clearPuppeteerCache,
  getPuppeteerDomains,
  addAlwaysPuppeteerDomains,
  addTryPuppeteerDomains,
  // Export constants for testing
  ALWAYS_PUPPETEER_DOMAINS,
  TRY_PUPPETEER_ON_BLOCK,
  BOT_PROTECTION_STATUS_CODES,
  BOT_PROTECTION_HEADERS,
  BOT_PROTECTION_BODY_PATTERNS,
};
