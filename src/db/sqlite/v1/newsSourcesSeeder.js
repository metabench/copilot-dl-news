'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load news sources from bootstrap JSON file
 * @returns {Array<{url: string, label: string, icon: string, region?: string}>}
 */
function loadNewsSourceDefaults() {
  const bootstrapPath = path.join(__dirname, '..', '..', '..', '..', 'data', 'bootstrap', 'news-sources.json');
  try {
    const data = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8'));
    return data.sources || [];
  } catch (err) {
    console.warn('[newsSourcesSeeder] Failed to load bootstrap file:', err.message);
    return [];
  }
}

// Load sources from bootstrap file (cached on first require)
const NEWS_SOURCE_DEFAULTS = loadNewsSourceDefaults();

/**
 * Derive URL pattern and website type from a URL
 * @param {string} url - The URL to analyze
 * @returns {{ parent_domain: string, url_pattern: string, website_type: string }}
 */
function deriveNewsWebsiteFields(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const path = parsed.pathname;
  
  // Extract the registrable domain (e.g., bbc.com from www.bbc.com)
  const parts = host.split('.');
  const tld = parts.slice(-1)[0];
  const domain = parts.length >= 2 ? parts.slice(-2).join('.') : host;
  
  // Determine type
  let website_type = 'domain';
  let parent_domain = domain;
  
  // Check if it's a subdomain (not www)
  if (parts.length > 2 && parts[0] !== 'www') {
    website_type = 'subdomain';
    parent_domain = domain;
  }
  
  // Check if it's path-based
  if (path && path !== '/' && path.length > 1) {
    website_type = 'path';
    parent_domain = domain;
  }
  
  // Build pattern - match URLs starting with this base
  const baseUrl = `${parsed.protocol}//${host}${path}`;
  const url_pattern = baseUrl.endsWith('/') ? `${baseUrl}%` : `${baseUrl}/%`;
  
  return { parent_domain, url_pattern, website_type };
}

/**
 * Seed default news sources into the database
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options] - Options
 * @param {Object} [options.logger] - Logger instance
 * @returns {{ success: boolean, seeded: number, skipped: number, reason?: string }}
 */
function seedNewsSources(db, { logger = console } = {}) {
  if (!db) return { success: false, reason: 'no database handle' };
  
  try {
    const checkStmt = db.prepare(`SELECT id FROM news_websites WHERE url = ?`);
    const insertStmt = db.prepare(`
      INSERT INTO news_websites (url, label, parent_domain, url_pattern, website_type, added_at, added_by, enabled, metadata)
      VALUES (@url, @label, @parent_domain, @url_pattern, @website_type, @added_at, @added_by, 1, @metadata)
    `);
    
    let seeded = 0;
    let skipped = 0;
    
    const txn = db.transaction((sources) => {
      for (const source of sources) {
        // Check if already exists
        const existing = checkStmt.get(source.url);
        if (existing) {
          skipped++;
          continue;
        }
        
        const fields = deriveNewsWebsiteFields(source.url);
        insertStmt.run({
          url: source.url,
          label: source.label,
          parent_domain: fields.parent_domain,
          url_pattern: fields.url_pattern,
          website_type: fields.website_type,
          added_at: new Date().toISOString(),
          added_by: 'seeder',
          metadata: JSON.stringify({ icon: source.icon })
        });
        seeded++;
      }
    });
    
    txn(NEWS_SOURCE_DEFAULTS);
    
    if (seeded > 0) {
      logger.info?.(`[seedNewsSources] Seeded ${seeded} news sources, skipped ${skipped} existing`);
    }
    
    return { success: true, seeded, skipped };
  } catch (error) {
    logger.warn?.('[seedNewsSources] Failed to seed news sources:', error.message);
    return { success: false, reason: error.message };
  }
}

module.exports = {
  NEWS_SOURCE_DEFAULTS,
  loadNewsSourceDefaults,
  deriveNewsWebsiteFields,
  seedNewsSources
};
