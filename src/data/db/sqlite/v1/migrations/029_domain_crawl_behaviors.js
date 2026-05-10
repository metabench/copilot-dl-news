/**
 * Migration 029: Domain Crawl Behaviors
 * 
 * Tracks learned domain behaviors for crawling:
 * - Whether Puppeteer is needed (for JS rendering or bot protection bypass)
 * - Detection reasons and confidence
 * - Success/failure rates with different methods
 * 
 * This enables the system to learn and persist which domains require
 * special handling across sessions.
 */

'use strict';

const up = `
-- Domain crawl behaviors (learned over time)
CREATE TABLE IF NOT EXISTS domain_crawl_behaviors (
  domain TEXT PRIMARY KEY,
  
  -- Puppeteer requirements
  needs_puppeteer INTEGER DEFAULT 0,
  puppeteer_reason TEXT,
  puppeteer_confidence REAL DEFAULT 0.0,
  puppeteer_last_needed_at TEXT,
  puppeteer_last_success_at TEXT,
  puppeteer_detection_count INTEGER DEFAULT 0,
  
  -- HTTP method support
  head_supported INTEGER DEFAULT 1,
  head_last_success_at TEXT,
  head_last_failure_at TEXT,
  
  -- Bot protection patterns observed
  has_cloudflare INTEGER DEFAULT 0,
  has_akamai INTEGER DEFAULT 0,
  has_captcha INTEGER DEFAULT 0,
  has_js_challenge INTEGER DEFAULT 0,
  
  -- Rate limiting learned values (supplements domain_rate_limits)
  effective_rpm INTEGER,
  retry_after_seconds INTEGER,
  
  -- Success tracking for method selection
  http_success_count INTEGER DEFAULT 0,
  http_failure_count INTEGER DEFAULT 0,
  puppeteer_success_count INTEGER DEFAULT 0,
  puppeteer_failure_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for quick lookup by needs_puppeteer
CREATE INDEX IF NOT EXISTS idx_dcb_needs_puppeteer 
  ON domain_crawl_behaviors(needs_puppeteer) WHERE needs_puppeteer = 1;

-- Index for finding domains with specific protection
CREATE INDEX IF NOT EXISTS idx_dcb_protection 
  ON domain_crawl_behaviors(has_cloudflare, has_akamai, has_captcha);
`;

const down = `
DROP INDEX IF EXISTS idx_dcb_protection;
DROP INDEX IF EXISTS idx_dcb_needs_puppeteer;
DROP TABLE IF EXISTS domain_crawl_behaviors;
`;

module.exports = { up, down };
