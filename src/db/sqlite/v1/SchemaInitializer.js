/**
 * src/db/sqlite/v1/SchemaInitializer.js
 *
 * Handles schema initialization and setup for the SQLite database.
 * Separated from main NewsDatabase class to reduce complexity.
 */

const { seedCrawlTypes } = require('./seeders');

class SchemaInitializer {
  constructor(db) {
    this.db = db;
    this._crawlTypesSeeded = false;
  }

  /**
   * Initialize schema (deprecated - now handled by ensureDb)
   * Kept for backward compatibility
   */
  init() {
    // This method is now deprecated as schema creation is handled by ensureDb.
    // It is kept for backward compatibility in case any old code calls it.
  }

  /**
   * Ensure crawl types are seeded
   */
  ensureCrawlTypesSeeded() {
    if (this._crawlTypesSeeded) return;
    const result = seedCrawlTypes(this.db);
    if (!result.success) {
      // Ignore seeding errors but avoid retry loop
      this._crawlTypesSeeded = true;
      return;
    }
    this._crawlTypesSeeded = true;
  }
}

module.exports = { SchemaInitializer };