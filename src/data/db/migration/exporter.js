/**
 * Database Exporter
 *
 * Exports SQLite database tables to NDJSON (newline-delimited JSON) format.
 * Useful for backups, data portability, and analytics.
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const ndjson = require('ndjson');
const { SchemaVersionManager } = require('./schema-versions');

class DatabaseExporter {
  constructor(db) {
    if (!db) {
      throw new Error('DatabaseExporter requires an open better-sqlite3 Database');
    }
    this.db = db;
    this.versionManager = new SchemaVersionManager(db);
  }

  /**
   * Export a single table to NDJSON
   * @param {string} tableName - Name of table to export
   * @param {string} outputPath - Path to output file
   * @param {number} [batchSize=1000] - Number of rows per batch
   * @returns {Promise<number>} Number of rows exported
   */
  async exportTable(tableName, outputPath, batchSize = 1000) {
    console.log(`[Exporter] Exporting table '${tableName}' to ${outputPath}`);

    const ensureWritable = async () => {
      const maxAttempts = 5;
      const baseDelayMs = 200;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (!fs.existsSync(outputPath)) {
            return;
          }

          fs.rmSync(outputPath, { force: true });
          return;
        } catch (err) {
          if (err.code === 'ENOENT') {
            return;
          }

          if (err.code === 'EBUSY' && attempt < maxAttempts) {
            console.warn(
              `[Exporter] Existing export file busy for '${outputPath}' (attempt ${attempt}/${maxAttempts}). Retrying...`
            );
            const delay = baseDelayMs * attempt;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          console.error(`[Exporter] Could not remove existing export file at ${outputPath}:`, err);
          throw err;
        }
      }

      throw new Error(`Unable to remove export file at ${outputPath} after ${maxAttempts} attempts`);
    };

    await ensureWritable();

    const writeStream = fs.createWriteStream(outputPath);
    const transform = ndjson.stringify();

    let totalRows = 0;

    try {
      await pipeline(
        this._createTableReadStream(tableName, batchSize),
        transform,
        writeStream
      );

      totalRows = this._getRowCount(tableName);
      console.log(`[Exporter] Exported ${totalRows} rows from '${tableName}'`);

      return totalRows;
    } catch (err) {
      console.error(`[Exporter] Failed to export table '${tableName}':`, err);
      throw err;
    }
  }


  /**
   * Create a readable stream of rows from a table
   * @private
   */
  _createTableReadStream(tableName, batchSize) {
    const stmt = this.db.prepare(`SELECT * FROM ${tableName}`);
    const iterator = stmt.iterate();
    let finished = false;

    const finalizeIterator = () => {
      if (finished) {
        return;
      }

      finished = true;

      if (typeof iterator.return === 'function') {
        try {
          iterator.return();
        } catch (finalizeErr) {
          console.warn(`[Exporter] Error while finalizing iterator for '${tableName}':`, finalizeErr);
        }
      }
    };

    return new Readable({
      objectMode: true,
      read() {
        if (finished) {
          this.push(null);
          return;
        }

        try {
          for (let i = 0; i < batchSize; i++) {
            const { value, done } = iterator.next();

            if (done) {
              finalizeIterator();
              this.push(null);
              return;
            }

            if (!this.push(value)) {
              return;
            }
          }
        } catch (err) {
          finalizeIterator();
          this.destroy(err);
        }
      },
      destroy(err, callback) {
        finalizeIterator();
        callback(err);
      }
    });
  }


  /**
   * Get row count for a table
   * @private
   */
  _getRowCount(tableName) {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
      return row?.count || 0;
    } catch (err) {
      console.warn(`[Exporter] Could not get row count for '${tableName}':`, err);
      return 0;
    }
  }

  /**
   * Export entire database to directory
   * @param {string} outputDir - Directory to export to
   * @param {Object} [options] - Export options
   * @param {Array<string>} [options.excludeTables] - Tables to exclude
   * @param {boolean} [options.includeSchema] - Include schema SQL (default: true)
   * @returns {Promise<Object>} Manifest with export metadata
   */
  async exportFullDatabase(outputDir, options = {}) {
    const { excludeTables = [], includeSchema = true } = options;

    console.log(`[Exporter] Starting full database export to ${outputDir}`);

    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get list of tables
    const tables = this._getTables().filter(table => !excludeTables.includes(table));

    const manifest = {
      exported_at: new Date().toISOString(),
      schema_version: this.versionManager.getCurrentVersion(),
      database_path: this.db.name,
      tables: {}
    };

    // Export each table
    for (const tableName of tables) {
      const outputPath = path.join(outputDir, `${tableName}.ndjson`);

      try {
        const rowCount = await this.exportTable(tableName, outputPath);

        manifest.tables[tableName] = {
          file: `${tableName}.ndjson`,
          row_count: rowCount,
          exported_at: new Date().toISOString()
        };
      } catch (err) {
        console.error(`[Exporter] Failed to export table '${tableName}':`, err);
        manifest.tables[tableName] = {
          error: err.message
        };
      }
    }

    // Export schema SQL
    if (includeSchema) {
      const schemaPath = path.join(outputDir, 'schema.sql');
      const schema = this._getSchema();
      fs.writeFileSync(schemaPath, schema, 'utf8');
      manifest.schema_file = 'schema.sql';
    }

    // Write manifest
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(`[Exporter] Export complete. Manifest written to ${manifestPath}`);

    return manifest;
  }

  /**
   * Get list of all tables in database
   * @private
   */
  _getTables() {
    const rows = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    return rows.map(row => row.name);
  }

  /**
   * Get full schema SQL
   * @private
   */
  _getSchema() {
    const rows = this.db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE sql IS NOT NULL
      ORDER BY type, name
    `).all();

    return rows.map(row => row.sql + ';').join('\n\n');
  }
}

module.exports = { DatabaseExporter };