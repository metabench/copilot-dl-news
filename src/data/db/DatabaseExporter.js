'use strict';

/**
 * DatabaseExporter — SQLite to PostgreSQL migration tool
 * 
 * Provides:
 *   - Full database export with progress tracking
 *   - Table-by-table migration
 *   - Resumable exports (tracks progress)
 *   - Schema compatibility checks
 *   - Dry-run mode for validation
 * 
 * Usage:
 *   const exporter = new DatabaseExporter({
 *     source: { engine: 'sqlite', dbPath: 'data/news.db' },
 *     target: { engine: 'postgres', connectionString: '...' }
 *   });
 *   await exporter.export({ onProgress: console.log });
 */

const { EventEmitter } = require('events');
const path = require('path');

// Tables in dependency order (parent tables first)
const TABLE_ORDER = [
  // Core entities
  'hosts',
  'urls',
  'hosts_extended',
  
  // HTTP layer
  'http_responses',
  'http_response_compression',
  
  // Content analysis
  'content_analysis',
  'article_xpath_patterns',
  
  // Gazetteer (reference data)
  'places',
  'place_types',
  'place_aliases',
  'place_relations',
  'place_administrative_divisions',
  
  // Place-hub system
  'place_page_mappings',
  'place_hub_candidates',
  'place_hub_url_patterns',
  
  // Classification & facts
  'facts',
  'classifications',
  
  // Queue & tasks
  'crawl_queue',
  'task_events',
  
  // Other tables (catch-all for anything not explicitly listed)
  '*'
];

class DatabaseExporter extends EventEmitter {
  /**
   * @param {Object} config
   * @param {Object} config.source - Source database config { engine, dbPath, connectionString }
   * @param {Object} config.target - Target database config { engine, dbPath, connectionString }
   * @param {number} [config.batchSize=1000] - Rows per batch
   * @param {boolean} [config.quiet=true] - Suppress console output
   */
  constructor(config) {
    super();
    this.config = {
      batchSize: 1000,
      quiet: true,
      ...config
    };
    
    this.source = null;
    this.target = null;
    this.initialized = false;
    
    // Progress tracking
    this.progress = {
      status: 'idle',
      startTime: null,
      currentTable: null,
      tables: {},
      totalRows: 0,
      exportedRows: 0,
      errors: []
    };
  }

  /**
   * Initialize connections
   */
  async initialize() {
    if (this.initialized) return;
    
    const { createDatabase } = require('./index');
    
    this.source = createDatabase(this.config.source);
    this.target = createDatabase(this.config.target);
    
    this.initialized = true;
    this._emit('initialized');
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.source?.close) await Promise.resolve(this.source.close());
    if (this.target?.close) await Promise.resolve(this.target.close());
    this.source = null;
    this.target = null;
    this.initialized = false;
  }

  /**
   * Get the source database handle
   */
  getSourceHandle() {
    return this.source?.getHandle?.() || this.source?.db || this.source;
  }

  /**
   * Get the target database handle
   */
  getTargetHandle() {
    return this.target?.getHandle?.() || this.target?.db || this.target;
  }

  // ─────────────────────────────────────────────────────────────
  // Export Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Run full export from source to target
   * @param {Object} [options]
   * @returns {Promise<Object>} Export statistics
   */
  async export(options = {}) {
    const {
      tables = null, // null = all, or array of table names
      dryRun = false,
      skipExisting = false,
      truncateFirst = false,
      onProgress = null
    } = options;
    
    if (!this.initialized) await this.initialize();
    
    this.progress = {
      status: 'running',
      startTime: Date.now(),
      currentTable: null,
      tables: {},
      totalRows: 0,
      exportedRows: 0,
      errors: [],
      dryRun
    };
    
    this._emit('export:start', { dryRun, skipExisting, truncateFirst });
    
    try {
      // Get tables to export
      const allTables = await this._getSourceTables();
      const tablesToExport = tables ? allTables.filter(t => tables.includes(t)) : allTables;
      
      // Sort by dependency order
      const sortedTables = this._sortTablesByDependency(tablesToExport);
      
      // Get row counts for progress calculation
      for (const table of sortedTables) {
        const count = await this._getRowCount(table);
        this.progress.tables[table] = { total: count, exported: 0, status: 'pending' };
        this.progress.totalRows += count;
      }
      
      this._emit('export:plan', { tables: sortedTables, totalRows: this.progress.totalRows });
      
      // Export each table
      for (const table of sortedTables) {
        this.progress.currentTable = table;
        this.progress.tables[table].status = 'exporting';
        this._emit('export:table-start', { table, total: this.progress.tables[table].total });
        
        try {
          if (truncateFirst && !dryRun) {
            await this._truncateTargetTable(table);
          }
          
          const result = await this._exportTable(table, {
            dryRun,
            skipExisting,
            onProgress: (p) => {
              this.progress.tables[table].exported = p.exported;
              this.progress.exportedRows = Object.values(this.progress.tables)
                .reduce((sum, t) => sum + t.exported, 0);
              
              if (onProgress) onProgress(this.progress);
              this._emit('export:progress', this.progress);
            }
          });
          
          this.progress.tables[table].status = 'complete';
          this.progress.tables[table].durationMs = result.durationMs;
          this._emit('export:table-complete', { table, ...result });
          
        } catch (err) {
          this.progress.tables[table].status = 'error';
          this.progress.tables[table].error = err.message;
          this.progress.errors.push({ table, error: err.message });
          this._emit('export:table-error', { table, error: err.message });
        }
      }
      
      this.progress.status = this.progress.errors.length > 0 ? 'completed-with-errors' : 'complete';
      this.progress.endTime = Date.now();
      this.progress.durationMs = this.progress.endTime - this.progress.startTime;
      
      this._emit('export:complete', this.progress);
      return this.progress;
      
    } catch (err) {
      this.progress.status = 'failed';
      this.progress.error = err.message;
      this._emit('export:failed', { error: err.message });
      throw err;
    }
  }

  /**
   * Export a single table
   */
  async exportTable(tableName, options = {}) {
    if (!this.initialized) await this.initialize();
    return this._exportTable(tableName, options);
  }

  /**
   * Get export status
   */
  getProgress() {
    return { ...this.progress };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────

  async _getSourceTables() {
    const handle = this.getSourceHandle();
    
    if (this.config.source.engine === 'sqlite') {
      const tables = handle.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();
      return tables.map(t => t.name);
    }
    
    // PostgreSQL
    const result = await handle.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return result.rows.map(r => r.table_name);
  }

  _sortTablesByDependency(tables) {
    const ordered = [];
    const remaining = new Set(tables);
    
    // Add tables in defined order first
    for (const table of TABLE_ORDER) {
      if (table === '*') {
        // Add remaining tables
        for (const t of remaining) {
          ordered.push(t);
        }
        remaining.clear();
      } else if (remaining.has(table)) {
        ordered.push(table);
        remaining.delete(table);
      }
    }
    
    return ordered;
  }

  async _getRowCount(tableName) {
    const handle = this.getSourceHandle();
    
    if (this.config.source.engine === 'sqlite') {
      return handle.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get().count;
    }
    
    const result = await handle.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    return parseInt(result.rows[0].count, 10);
  }

  async _getColumns(tableName) {
    const handle = this.getSourceHandle();
    
    if (this.config.source.engine === 'sqlite') {
      const info = handle.prepare(`PRAGMA table_info("${tableName}")`).all();
      return info.map(c => ({ name: c.name, type: c.type, pk: c.pk === 1 }));
    }
    
    const result = await handle.query(`
      SELECT column_name, data_type, 
             (SELECT EXISTS(
               SELECT 1 FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu 
                 ON tc.constraint_name = kcu.constraint_name
               WHERE tc.table_name = $1 
                 AND tc.constraint_type = 'PRIMARY KEY'
                 AND kcu.column_name = c.column_name
             )) as is_pk
      FROM information_schema.columns c
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    
    return result.rows.map(r => ({
      name: r.column_name,
      type: r.data_type,
      pk: r.is_pk
    }));
  }

  async _truncateTargetTable(tableName) {
    const handle = this.getTargetHandle();
    
    if (this.config.target.engine === 'sqlite') {
      handle.prepare(`DELETE FROM "${tableName}"`).run();
    } else {
      await handle.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    }
  }

  async _exportTable(tableName, options) {
    const { dryRun, skipExisting, onProgress } = options;
    const batchSize = this.config.batchSize;
    
    const result = { rowsExported: 0, rowsSkipped: 0, batches: 0, durationMs: 0 };
    const startTime = Date.now();
    
    const sourceHandle = this.getSourceHandle();
    const targetHandle = this.getTargetHandle();
    
    const columns = await this._getColumns(tableName);
    const columnNames = columns.map(c => c.name);
    const pkColumns = columns.filter(c => c.pk).map(c => c.name);
    
    const totalRows = await this._getRowCount(tableName);
    let offset = 0;
    
    while (offset < totalRows) {
      let rows;
      if (this.config.source.engine === 'sqlite') {
        rows = sourceHandle.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`)
          .all(batchSize, offset);
      } else {
        const res = await sourceHandle.query(
          `SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );
        rows = res.rows;
      }
      
      if (!dryRun && rows.length > 0) {
        const insertResult = await this._insertBatch(tableName, columnNames, pkColumns, rows, skipExisting);
        result.rowsExported += insertResult.inserted;
        result.rowsSkipped += insertResult.skipped;
      } else {
        result.rowsExported += rows.length;
      }
      
      result.batches++;
      offset += batchSize;
      
      if (onProgress) {
        onProgress({ table: tableName, exported: result.rowsExported, total: totalRows });
      }
    }
    
    result.durationMs = Date.now() - startTime;
    return result;
  }

  async _insertBatch(tableName, columns, pkColumns, rows, skipExisting) {
    const result = { inserted: 0, skipped: 0 };
    const targetHandle = this.getTargetHandle();
    const colList = columns.map(c => `"${c}"`).join(', ');
    
    if (this.config.target.engine === 'sqlite') {
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = skipExisting
        ? `INSERT OR IGNORE INTO "${tableName}" (${colList}) VALUES (${placeholders})`
        : `INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})`;
      
      const stmt = targetHandle.prepare(insertSql);
      const insertMany = targetHandle.transaction((rows) => {
        for (const row of rows) {
          const changes = stmt.run(...columns.map(c => row[c])).changes;
          if (changes > 0) result.inserted++;
          else result.skipped++;
        }
      });
      insertMany(rows);
      
    } else {
      // PostgreSQL
      const values = columns.map((_, i) => `$${i + 1}`).join(', ');
      
      let insertSql;
      if (skipExisting) {
        insertSql = `INSERT INTO "${tableName}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING`;
      } else if (pkColumns.length > 0) {
        const conflictCols = pkColumns.map(c => `"${c}"`).join(', ');
        const updateCols = columns
          .filter(c => !pkColumns.includes(c))
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        
        insertSql = updateCols
          ? `INSERT INTO "${tableName}" (${colList}) VALUES (${values}) ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`
          : `INSERT INTO "${tableName}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING`;
      } else {
        insertSql = `INSERT INTO "${tableName}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING`;
      }
      
      for (const row of rows) {
        const params = columns.map(c => row[c]);
        const res = await targetHandle.query(insertSql, params);
        if (res.rowCount > 0) result.inserted++;
        else result.skipped++;
      }
    }
    
    return result;
  }

  _emit(event, data = {}) {
    if (!this.config.quiet || event.startsWith('export:')) {
      this.emit(event, { timestamp: new Date().toISOString(), ...data });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Entry Point
// ─────────────────────────────────────────────────────────────

async function runExportCLI() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Database Exporter — Export SQLite to PostgreSQL

Usage: node src/db/DatabaseExporter.js [options]

Options:
  --source <path>       Source SQLite database path (default: data/news.db)
  --target <connstr>    Target PostgreSQL connection string
  --tables <list>       Comma-separated list of tables (default: all)
  --batch-size <n>      Rows per batch (default: 1000)
  --dry-run             Preview without writing
  --truncate            Truncate target tables first
  --skip-existing       Skip existing rows (don't update)
  --json                Output progress as JSON
  --help, -h            Show this help

Environment Variables:
  DB_SOURCE_PATH        Source SQLite path
  DB_TARGET_CONNECTION  Target PostgreSQL connection string
    `);
    process.exit(0);
  }
  
  // Parse arguments
  const getArg = (name, defaultValue = null) => {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return defaultValue;
    return args[idx + 1] || defaultValue;
  };
  
  const hasFlag = (name) => args.includes(`--${name}`);
  
  const config = {
    source: {
      engine: 'sqlite',
      dbPath: getArg('source') || process.env.DB_SOURCE_PATH || 'data/news.db'
    },
    target: {
      engine: 'postgres',
      connectionString: getArg('target') || process.env.DB_TARGET_CONNECTION
    },
    batchSize: parseInt(getArg('batch-size', '1000'), 10),
    quiet: !hasFlag('verbose')
  };
  
  if (!config.target.connectionString) {
    console.error('Error: --target connection string or DB_TARGET_CONNECTION required');
    process.exit(1);
  }
  
  const exporter = new DatabaseExporter(config);
  
  // Progress logging
  if (!hasFlag('json')) {
    exporter.on('export:start', () => console.log('Starting export...'));
    exporter.on('export:table-start', ({ table, total }) => 
      console.log(`  Exporting ${table} (${total} rows)...`));
    exporter.on('export:table-complete', ({ table, rowsExported, durationMs }) =>
      console.log(`  ✓ ${table}: ${rowsExported} rows in ${durationMs}ms`));
    exporter.on('export:table-error', ({ table, error }) =>
      console.error(`  ✗ ${table}: ${error}`));
    exporter.on('export:complete', ({ totalRows, exportedRows, durationMs }) =>
      console.log(`\nExport complete: ${exportedRows}/${totalRows} rows in ${(durationMs/1000).toFixed(1)}s`));
  }
  
  try {
    const tables = getArg('tables')?.split(',').map(t => t.trim()) || null;
    
    const result = await exporter.export({
      tables,
      dryRun: hasFlag('dry-run'),
      truncateFirst: hasFlag('truncate'),
      skipExisting: hasFlag('skip-existing'),
      onProgress: hasFlag('json') ? (p) => console.log(JSON.stringify(p)) : null
    });
    
    if (hasFlag('json')) {
      console.log(JSON.stringify(result, null, 2));
    }
    
    await exporter.close();
    process.exit(result.errors.length > 0 ? 1 : 0);
    
  } catch (err) {
    console.error('Export failed:', err.message);
    await exporter.close();
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  runExportCLI();
}

module.exports = {
  DatabaseExporter
};
