/**
 * Schema Version Manager
 *
 * Tracks which schema version is currently applied to the database.
 * Provides utilities for recording migrations and querying migration history.
 */

class SchemaVersionManager {
  constructor(db) {
    if (!db) {
      throw new Error('SchemaVersionManager requires an open better-sqlite3 Database');
    }
    this.db = db;
    this._ensureVersionTable();
  }

  /**
   * Ensure schema_migrations table exists (idempotent)
   */
  _ensureVersionTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        description TEXT,
        rollback_sql TEXT
      );
    `);
  }

  /**
   * Get current schema version
   * @returns {number} Current version (0 if no migrations applied)
   */
  getCurrentVersion() {
    const row = this.db.prepare(`
      SELECT MAX(version) AS current_version
      FROM schema_migrations
    `).get();

    return row?.current_version || 0;
  }

  /**
   * Record a migration
   * @param {number} version - Migration version number
   * @param {string} name - Short identifier (snake_case)
   * @param {string} description - Human-readable description
   * @param {string} [rollbackSql] - SQL to rollback this migration (optional)
   */
  recordMigration(version, name, description, rollbackSql = null) {
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error('Migration version must be a positive integer');
    }

    if (!name || typeof name !== 'string') {
      throw new Error('Migration name is required');
    }

    try {
      this.db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at, description, rollback_sql)
        VALUES (?, ?, datetime('now'), ?, ?)
      `).run(version, name, description, rollbackSql);

      console.log(`[SchemaVersionManager] Recorded migration v${version}: ${name}`);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Migration version ${version} already applied`);
      }
      throw err;
    }
  }

  /**
   * Get migration history
   * @returns {Array<Object>} Array of migration records
   */
  getMigrationHistory() {
    return this.db.prepare(`
      SELECT version, name, applied_at, description
      FROM schema_migrations
      ORDER BY version ASC
    `).all();
  }

  /**
   * Check if a specific version has been applied
   * @param {number} version - Version to check
   * @returns {boolean}
   */
  hasVersion(version) {
    try {
      const row = this.db.prepare(`
        SELECT 1 FROM schema_migrations WHERE version = ?
      `).get(version);

      return !!row;
    } catch (err) {
      console.error(`[SchemaVersionManager] Failed to check version ${version}:`, err);
      return false;
    }
  }

  /**
   * Get details about a specific migration
   * @param {number} version - Migration version
   * @returns {Object|null} Migration record
   */
  getMigration(version) {
    try {
      return this.db.prepare(`
        SELECT version, name, applied_at, description, rollback_sql
        FROM schema_migrations
        WHERE version = ?
      `).get(version);
    } catch (err) {
      console.error(`[SchemaVersionManager] Failed to get migration ${version}:`, err);
      return null;
    }
  }

  /**
   * Print migration history to console
   */
  printHistory() {
    const history = this.getMigrationHistory();

    if (history.length === 0) {
      console.log('No migrations recorded');
      return;
    }

    console.log('\nSchema Migration History:');
    console.log('─────────────────────────────────────────────────────────────');

    for (const migration of history) {
      console.log(`v${migration.version}: ${migration.name}`);
      console.log(`  Applied: ${migration.applied_at}`);
      if (migration.description) {
        console.log(`  Description: ${migration.description}`);
      }
      console.log('');
    }

    console.log(`Current version: ${this.getCurrentVersion()}`);
  }
}

module.exports = { SchemaVersionManager };