/**
 * Database Importer with Transformations
 *
 * Imports from NDJSON (newline-delimited JSON) format with support for
 * data transformations between schema versions.
 */

const fs = require('fs');
const path = require('path');
const ndjson = require('ndjson');
const { pipeline } = require('stream/promises');

class DatabaseImporter {
  constructor(db, transformers = {}) {
    if (!db) {
      throw new Error('DatabaseImporter requires an open better-sqlite3 Database');
    }
    this.db = db;
    this.transformers = transformers;
    this._tableColumnCache = new Map();
    this._columnFilterWarnings = new Set();
  }

  /**
   * Import a single table from NDJSON
   * @param {string} tableName - Name of table to import into
   * @param {string} inputPath - Path to NDJSON file
   * @param {number} [batchSize=1000] - Number of rows per batch
   * @returns {Promise<number>} Number of rows imported
   */
  async importTable(tableName, inputPath, batchSize = 1000) {
    console.log(`[Importer] Importing into table '${tableName}' from ${inputPath}`);

    const readStream = fs.createReadStream(inputPath);
    const parser = ndjson.parse();

    let batch = [];
    let imported = 0;

    await pipeline(
      readStream,
      parser,
      async function* (source) {
        for await (const row of source) {
          // Apply transformations if registered
          const transformed = this.transformers[tableName]
            ? this.transformers[tableName](row)
            : row;

          batch.push(transformed);

          if (batch.length >= batchSize) {
            yield batch;
            batch = [];
          }
        }

        if (batch.length > 0) {
          yield batch;
        }
      }.bind(this),
      async function* (source) {
        for await (const batch of source) {
          this._insertBatch(tableName, batch);
          imported += batch.length;

          if (imported % 10000 === 0) {
            console.log(`[Importer] Imported ${imported} rows into ${tableName}`);
          }
        }
      }.bind(this)
    );

    console.log(`[Importer] Completed import of ${imported} rows into '${tableName}'`);

    return imported;
  }

  /**
   * Insert a batch of rows into a table
   * @private
   */
        _insertBatch(tableName, rows) {
    if (rows.length === 0) return;

    const allowedColumns = this._getTableColumnSet(tableName);
    const inputColumns = Object.keys(rows[0]);
    const columns = inputColumns.filter((name) => allowedColumns.has(name));

    if (columns.length === 0) {
      throw new Error(`No matching columns found in target table '${tableName}' for columns: ${inputColumns.join(', ')}`);
    }

    if (columns.length !== inputColumns.length) {
      const dropped = inputColumns.filter((name) => !allowedColumns.has(name));
      if (dropped.length > 0) {
        const warningKey = `${tableName}:${dropped.join(',')}`;
        if (!this._columnFilterWarnings.has(warningKey)) {
          console.warn(`[Importer] Dropping columns [${dropped.join(', ')}] not present in target table '${tableName}'`);
          this._columnFilterWarnings.add(warningKey);
        }
      }
    }

    const placeholders = columns.map(() => '?').join(', ');
    // Quote identifiers so reserved names (e.g., "exists") stay valid
    const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""')}"`;
    const quotedTableName = quoteIdentifier(tableName);
    const quotedColumns = columns.map(quoteIdentifier);
    const sql = `
      INSERT INTO ${quotedTableName} (${quotedColumns.join(', ')})
      VALUES (${placeholders})
    `;

    // Convert JSON-serialized buffers back to Node Buffers before insertion.
    const normalizeValue = (value) => {
      if (value && typeof value === 'object') {
        if (Buffer.isBuffer(value)) {
          return value;
        }
        if (value.type === 'Buffer' && Array.isArray(value.data)) {
          return Buffer.from(value.data);
        }
      }
      return value;
    };

    const stmt = this.db.prepare(sql);

    const txn = this.db.transaction((batch) => {
      for (const row of batch) {
        const values = columns.map((col) => normalizeValue(row[col]));
        stmt.run(...values);
      }
    });

    txn(rows);
  }

  _getTableColumnSet(tableName) {
    const cache = this._tableColumnCache;

    if (!cache.has(tableName)) {
      const rows = this.db
        .prepare('SELECT name FROM pragma_table_info(?)')
        .all(tableName);

      if (!rows || rows.length === 0) {
        throw new Error(`Unable to resolve columns for table '${tableName}' during import`);
      }

      cache.set(tableName, new Set(rows.map((row) => row.name)));
    }

    return cache.get(tableName);
  }




  /**
   * Import from manifest file
   * @param {string} manifestPath - Path to manifest.json
   * @returns {Promise<Object>} Import results
   */
  async importFromManifest(manifestPath, options = {}) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const baseDir = path.dirname(manifestPath);

    return this.importFromManifestObject(manifest, {
      ...options,
      baseDir
    });
  }


  /**
   * Import from manifest object (for in-memory manifests)
   * @param {Object} manifest - Manifest object
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Import results
   */
  async importFromManifestObject(manifest, options = {}) {
    const baseDir = options.baseDir || process.cwd();
    const batchSize = options.batchSize || 1000;
    const resetTables = options.resetTables !== false;

    console.log(`[Importer] Importing database exported at ${manifest.exported_at}`);
    console.log(`[Importer] Source schema version: ${manifest.schema_version}`);

    const results = {
      manifest,
      tables: {},
      tablesImported: 0,
      totalRows: 0
    };

    const deferredUpdates = [];
    const tableOrder = this._getDependencyOrder(Object.keys(manifest.tables));

    const resetTargetTable = (tableName) => {
      if (!resetTables) {
        return;
      }

      try {
        this.db.prepare(`DELETE FROM ${tableName}`).run();
        try {
          this.db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tableName);
        } catch (err) {
          if (!err.message.includes('no such table: sqlite_sequence')) {
            console.warn(`[Importer] Unable to reset autoincrement for table '${tableName}': ${err.message}`);
          }
        }
      } catch (err) {
        throw new Error(`Failed to reset table '${tableName}': ${err.message}`);
      }
    };

    let foreignKeysDisabled = false;
    if (resetTables) {
      try {
        const currentForeignKeys = this.db.pragma('foreign_keys', { simple: true });
        if (currentForeignKeys !== 0) {
          this.db.pragma('foreign_keys = OFF');
          foreignKeysDisabled = true;
        }
      } catch (err) {
        console.warn(`[Importer] Unable to disable foreign key constraints before import: ${err.message}`);
      }
    }

    try {
      for (const tableName of tableOrder) {
        const meta = manifest.tables[tableName];
        if (meta.error) {
          console.warn(`[Importer] Skipping table '${tableName}' due to export error: ${meta.error}`);
          results.tables[tableName] = { error: meta.error };
          continue;
        }

        const inputPath = path.join(baseDir, meta.file);

        try {
          resetTargetTable(tableName);

          let imported;
          if (tableName === 'places') {
            imported = await this._importTableWithDeferredUpdates(tableName, inputPath, batchSize, deferredUpdates);
          } else {
            imported = await this.importTable(tableName, inputPath, batchSize);
          }

          results.tables[tableName] = {
            expected: meta.row_count,
            imported,
            success: imported === meta.row_count
          };

          results.tablesImported += 1;
          results.totalRows += imported;

          if (imported !== meta.row_count) {
            console.warn(`[Importer] Row count mismatch for ${tableName}: expected ${meta.row_count}, got ${imported}`);
          }
        } catch (err) {
          console.error(`[Importer] Failed to import table '${tableName}':`, err);
          results.tables[tableName] = { error: err.message };
        }
      }
    } finally {
      if (foreignKeysDisabled) {
        try {
          this.db.pragma('foreign_keys = ON');
        } catch (err) {
          console.warn(`[Importer] Unable to re-enable foreign key constraints after import: ${err.message}`);
        }
      }
    }

    if (deferredUpdates.length > 0) {
      console.log(`[Importer] Applying ${deferredUpdates.length} deferred updates...`);
      for (const update of deferredUpdates) {
        try {
          await update();
        } catch (err) {
          console.error('[Importer] Failed to apply deferred update:', err);
        }
      }
    }

    console.log('[Importer] Import complete');

    return results;
  }


  /**
   * Get tables in dependency order (parent tables before child tables)
   * @private
   * @param {string[]} tableNames - Array of table names
   * @returns {string[]} Tables sorted by dependency order
   */
  _getDependencyOrder(tableNames) {
    // Known dependency order for Phase 0 (current schema)
    // Parent tables must come before child tables that reference them
    const dependencyOrder = [
      // Core tables with no dependencies
      'urls',
      'articles',
      'background_tasks',
      'compression_types',
      'compression_buckets',
      'content_storage',
      'crawl_types',
      'crawler_settings',
      'domain_categories',
      'domain_category_map',
      'domain_locales',
      'domains',
      'errors',
      'fetches',
      'gazetteer_crawl_state',
      'ingestion_runs',
      'latest_fetch',
      'links',
      'news_websites',
      'news_websites_stats_cache',
      'page_categories',
      'page_category_map',
      'place_attribute_values',
      'place_external_ids',
      'place_hierarchy',
      'place_hub_unknown_terms',
      'place_hubs',
      // places must come before place_names (place_names.place_id -> places.id)
      'places',
      'place_names',
      'place_sources',
      'planner_stage_events',
      'query_telemetry',
      'queue_events',
      'schema_migrations',
      'topic_keywords',
      'url_aliases',
      'url_categories',
      'url_category_map',
      // Crawl-related tables
      'crawl_jobs',
      'crawl_milestones',
      'crawl_problems',
      'crawl_skip_terms',
      'crawl_tasks'
    ];

    // Sort provided table names according to dependency order
    const ordered = [];
    const remaining = new Set(tableNames);

    // First pass: add tables in dependency order if they exist
    for (const table of dependencyOrder) {
      if (remaining.has(table)) {
        ordered.push(table);
        remaining.delete(table);
      }
    }

    // Second pass: add any remaining tables (shouldn't happen in Phase 0)
    for (const table of remaining) {
      ordered.push(table);
    }

    return ordered;
  }

  /**
   * Import places table with deferred canonical_name_id updates
   * @private
   */
  async _importTableWithDeferredUpdates(tableName, inputPath, batchSize, deferredUpdates) {
    console.log(`[Importer] Importing into table '${tableName}' from ${inputPath} (with deferred updates)`);

    const readStream = fs.createReadStream(inputPath);
    const parser = ndjson.parse();

    let batch = [];
    let imported = 0;
    const canonicalNameIds = []; // Store {id, canonical_name_id} for later update

    await pipeline(
      readStream,
      parser,
      async function* (source) {
        for await (const row of source) {
          // Store original canonical_name_id for later restoration
          if (row.canonical_name_id !== null && row.canonical_name_id !== undefined) {
            canonicalNameIds.push({ id: row.id, canonical_name_id: row.canonical_name_id });
            row.canonical_name_id = null; // Temporarily set to NULL
          }

          // Apply transformations if registered
          const transformed = this.transformers[tableName]
            ? this.transformers[tableName](row)
            : row;

          batch.push(transformed);

          if (batch.length >= batchSize) {
            yield batch;
            batch = [];
          }
        }

        if (batch.length > 0) {
          yield batch;
        }
      }.bind(this),
      async function* (source) {
        for await (const batch of source) {
          this._insertBatch(tableName, batch);
          imported += batch.length;

          if (imported % 10000 === 0) {
            console.log(`[Importer] Imported ${imported} rows into ${tableName}`);
          }
        }
      }.bind(this)
    );

    // Add deferred update to restore canonical_name_id values
    if (canonicalNameIds.length > 0) {
      deferredUpdates.push(async () => {
        console.log(`[Importer] Restoring ${canonicalNameIds.length} canonical_name_id values...`);
        const updateStmt = this.db.prepare(
          'UPDATE places SET canonical_name_id = ? WHERE id = ?'
        );
        const txn = this.db.transaction((updates) => {
          for (const update of updates) {
            updateStmt.run(update.canonical_name_id, update.id);
          }
        });
        txn(canonicalNameIds);
        console.log(`[Importer] Restored ${canonicalNameIds.length} canonical_name_id values`);
      });
    }

    console.log(`[Importer] Completed import of ${imported} rows into '${tableName}'`);

    return imported;
  }
}

module.exports = { DatabaseImporter };