'use strict';

/**
 * DualDatabaseFacade — Intelligent multi-database adapter
 * 
 * Supports three modes:
 *   1. 'single'     - Use one database only (SQLite or PostgreSQL)
 *   2. 'primary'    - Primary for writes, secondary for reads (future)
 *   3. 'dual-write' - Write to both databases, read from primary
 *   4. 'export'     - Export from source to target, then switch to target
 * 
 * This facade wraps the existing database adapters and provides:
 *   - Same API surface as NewsDatabase / PostgresNewsDatabase
 *   - Transparent dual-write capability
 *   - Export/migration progress tracking via events
 *   - Configuration-driven database selection
 * 
 * Usage:
 *   const facade = new DualDatabaseFacade({
 *     mode: 'dual-write',
 *     primary: { engine: 'sqlite', dbPath: 'data/news.db' },
 *     secondary: { engine: 'postgres', connectionString: 'postgres://...' }
 *   });
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// Database mode constants
const MODES = {
  SINGLE: 'single',
  PRIMARY: 'primary',
  DUAL_WRITE: 'dual-write',
  EXPORT: 'export'
};

// Default configuration
const DEFAULT_CONFIG = {
  mode: MODES.SINGLE,
  primary: { engine: 'sqlite', dbPath: 'data/news.db' },
  secondary: null,
  quietLogging: true,
  exportBatchSize: 1000,
  exportProgressIntervalMs: 5000
};

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} engine - 'sqlite' or 'postgres'
 * @property {string} [dbPath] - Path for SQLite
 * @property {string} [connectionString] - Connection string for PostgreSQL
 */

/**
 * @typedef {Object} DualDatabaseConfig
 * @property {'single'|'primary'|'dual-write'|'export'} mode
 * @property {DatabaseConfig} primary
 * @property {DatabaseConfig} [secondary]
 * @property {boolean} [quietLogging]
 * @property {number} [exportBatchSize]
 */

class DualDatabaseFacade extends EventEmitter {
  /**
   * @param {DualDatabaseConfig} config
   */
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mode = this.config.mode;
    this.quietLogging = this.config.quietLogging;
    
    // Database instances
    this.primary = null;
    this.secondary = null;
    
    // State
    this.initialized = false;
    this.exportInProgress = false;
    this.exportStats = null;
    
    // Method proxies cache
    this._methodCache = new Map();
  }

  /**
   * Initialize the facade and connect to databases
   * @returns {Promise<DualDatabaseFacade>}
   */
  async initialize() {
    if (this.initialized) return this;
    
    const { createDatabase } = require('./index');
    
    // Initialize primary database
    this.primary = createDatabase(this.config.primary);
    this._log('debug', `Primary database initialized: ${this.config.primary.engine}`);
    
    // Initialize secondary if configured
    if (this.config.secondary && this.mode !== MODES.SINGLE) {
      this.secondary = createDatabase(this.config.secondary);
      this._log('debug', `Secondary database initialized: ${this.config.secondary.engine}`);
    }
    
    this.initialized = true;
    this.emit('initialized', { mode: this.mode, primary: this.config.primary.engine });
    return this;
  }

  /**
   * Get the active database handle (for direct access when needed)
   * @returns {Object}
   */
  getHandle() {
    return this.primary?.getHandle?.() || this.primary?.db || this.primary;
  }

  /**
   * Get the secondary database handle
   * @returns {Object|null}
   */
  getSecondaryHandle() {
    if (!this.secondary) return null;
    return this.secondary?.getHandle?.() || this.secondary?.db || this.secondary;
  }

  /**
   * Close all database connections
   */
  async close() {
    const errors = [];
    
    if (this.primary) {
      try {
        if (typeof this.primary.close === 'function') {
          await Promise.resolve(this.primary.close());
        }
      } catch (err) {
        errors.push({ db: 'primary', error: err.message });
      }
    }
    
    if (this.secondary) {
      try {
        if (typeof this.secondary.close === 'function') {
          await Promise.resolve(this.secondary.close());
        }
      } catch (err) {
        errors.push({ db: 'secondary', error: err.message });
      }
    }
    
    this.primary = null;
    this.secondary = null;
    this.initialized = false;
    
    if (errors.length > 0) {
      this.emit('close-errors', errors);
    }
    this.emit('closed');
  }

  // ─────────────────────────────────────────────────────────────
  // Mode Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Get current database mode
   * @returns {string}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get status for UI display
   * @returns {Object}
   */
  getStatus() {
    return {
      mode: this.mode,
      initialized: this.initialized,
      primary: {
        engine: this.config.primary.engine,
        connected: !!this.primary
      },
      secondary: this.config.secondary ? {
        engine: this.config.secondary.engine,
        connected: !!this.secondary
      } : null,
      exportInProgress: this.exportInProgress,
      exportStats: this.exportStats
    };
  }

  /**
   * Switch to a different mode at runtime
   * @param {string} newMode
   * @param {Object} [options]
   */
  async setMode(newMode, options = {}) {
    if (!Object.values(MODES).includes(newMode)) {
      throw new Error(`Invalid mode: ${newMode}. Valid: ${Object.values(MODES).join(', ')}`);
    }
    
    const oldMode = this.mode;
    this.mode = newMode;
    
    // If switching to dual-write or export, ensure secondary is connected
    if ((newMode === MODES.DUAL_WRITE || newMode === MODES.EXPORT) && !this.secondary) {
      if (!this.config.secondary) {
        throw new Error(`Mode '${newMode}' requires secondary database configuration`);
      }
      const { createDatabase } = require('./index');
      this.secondary = createDatabase(this.config.secondary);
    }
    
    this.emit('mode-changed', { from: oldMode, to: newMode });
    this._log('info', `Mode changed: ${oldMode} → ${newMode}`);
  }

  // ─────────────────────────────────────────────────────────────
  // Export / Migration
  // ─────────────────────────────────────────────────────────────

  /**
   * Export data from primary to secondary database
   * @param {Object} [options]
   * @returns {Promise<Object>} Export statistics
   */
  async exportToSecondary(options = {}) {
    if (!this.secondary) {
      throw new Error('No secondary database configured');
    }
    
    if (this.exportInProgress) {
      throw new Error('Export already in progress');
    }
    
    const {
      tables = null, // null = all tables, or array of table names
      batchSize = this.config.exportBatchSize,
      onProgress = null,
      dryRun = false
    } = options;
    
    this.exportInProgress = true;
    this.exportStats = {
      startTime: Date.now(),
      tables: {},
      totalRows: 0,
      errors: []
    };
    
    this.emit('export:start', { dryRun, batchSize });
    
    try {
      // Get list of tables to export
      const tablesToExport = tables || await this._getExportableTables();
      
      for (const table of tablesToExport) {
        try {
          const result = await this._exportTable(table, { batchSize, dryRun, onProgress });
          this.exportStats.tables[table] = result;
          this.exportStats.totalRows += result.rowsExported;
          
          this.emit('export:table-complete', { table, ...result });
        } catch (err) {
          this.exportStats.errors.push({ table, error: err.message });
          this.emit('export:table-error', { table, error: err.message });
        }
      }
      
      this.exportStats.endTime = Date.now();
      this.exportStats.durationMs = this.exportStats.endTime - this.exportStats.startTime;
      
      this.emit('export:complete', this.exportStats);
      return this.exportStats;
      
    } finally {
      this.exportInProgress = false;
    }
  }

  async _getExportableTables() {
    const handle = this.getHandle();
    
    // SQLite: get tables from sqlite_master
    if (this.config.primary.engine === 'sqlite') {
      const tables = handle.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();
      return tables.map(t => t.name);
    }
    
    // PostgreSQL: get tables from information_schema
    const result = await handle.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return result.rows.map(r => r.table_name);
  }

  async _exportTable(tableName, options) {
    const { batchSize, dryRun, onProgress } = options;
    const result = { rowsExported: 0, batches: 0, durationMs: 0 };
    const startTime = Date.now();
    
    const primaryHandle = this.getHandle();
    const secondaryHandle = this.getSecondaryHandle();
    
    // Get total count
    let totalRows;
    if (this.config.primary.engine === 'sqlite') {
      totalRows = primaryHandle.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get().count;
    } else {
      const countRes = await primaryHandle.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      totalRows = parseInt(countRes.rows[0].count, 10);
    }
    
    if (totalRows === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }
    
    // Get column info
    let columns;
    if (this.config.primary.engine === 'sqlite') {
      const info = primaryHandle.prepare(`PRAGMA table_info("${tableName}")`).all();
      columns = info.map(c => c.name);
    } else {
      const colRes = await primaryHandle.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 ORDER BY ordinal_position
      `, [tableName]);
      columns = colRes.rows.map(r => r.column_name);
    }
    
    // Export in batches
    let offset = 0;
    while (offset < totalRows) {
      let rows;
      if (this.config.primary.engine === 'sqlite') {
        rows = primaryHandle.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(batchSize, offset);
      } else {
        const res = await primaryHandle.query(`SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2`, [batchSize, offset]);
        rows = res.rows;
      }
      
      if (!dryRun && rows.length > 0) {
        await this._insertBatchToSecondary(tableName, columns, rows);
      }
      
      result.rowsExported += rows.length;
      result.batches++;
      offset += batchSize;
      
      if (onProgress) {
        onProgress({ table: tableName, exported: result.rowsExported, total: totalRows });
      }
      this.emit('export:progress', { table: tableName, exported: result.rowsExported, total: totalRows });
    }
    
    result.durationMs = Date.now() - startTime;
    return result;
  }

  async _insertBatchToSecondary(tableName, columns, rows) {
    const secondaryHandle = this.getSecondaryHandle();
    const colList = columns.map(c => `"${c}"`).join(', ');
    
    if (this.config.secondary.engine === 'sqlite') {
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = secondaryHandle.prepare(`
        INSERT OR REPLACE INTO "${tableName}" (${colList}) VALUES (${placeholders})
      `);
      const insertMany = secondaryHandle.transaction((rows) => {
        for (const row of rows) {
          stmt.run(...columns.map(c => row[c]));
        }
      });
      insertMany(rows);
    } else {
      // PostgreSQL: use batch insert with ON CONFLICT
      for (const row of rows) {
        const values = columns.map((_, i) => `$${i + 1}`).join(', ');
        const params = columns.map(c => row[c]);
        await secondaryHandle.query(`
          INSERT INTO "${tableName}" (${colList}) VALUES (${values})
          ON CONFLICT DO NOTHING
        `, params);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Dual-Write Method Proxying
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a proxy for a method that dual-writes
   * @param {string} methodName
   * @returns {Function}
   */
  _createDualWriteProxy(methodName) {
    return async (...args) => {
      // Always write to primary
      const primaryMethod = this.primary[methodName];
      if (typeof primaryMethod !== 'function') {
        throw new Error(`Method '${methodName}' not found on primary database`);
      }
      
      const primaryResult = await Promise.resolve(primaryMethod.apply(this.primary, args));
      
      // In dual-write mode, also write to secondary
      if (this.mode === MODES.DUAL_WRITE && this.secondary) {
        const secondaryMethod = this.secondary[methodName];
        if (typeof secondaryMethod === 'function') {
          try {
            await Promise.resolve(secondaryMethod.apply(this.secondary, args));
          } catch (err) {
            this.emit('dual-write-error', { method: methodName, error: err.message });
            this._log('warn', `Dual-write failed for ${methodName}: ${err.message}`);
          }
        }
      }
      
      return primaryResult;
    };
  }

  /**
   * Get a method from the facade (proxied for dual-write if needed)
   * @param {string} methodName
   * @returns {Function|undefined}
   */
  getMethod(methodName) {
    if (this._methodCache.has(methodName)) {
      return this._methodCache.get(methodName);
    }
    
    const primaryMethod = this.primary?.[methodName];
    if (typeof primaryMethod !== 'function') {
      return undefined;
    }
    
    // Determine if this is a write method that needs dual-write
    const isWriteMethod = this._isWriteMethod(methodName);
    
    let proxiedMethod;
    if (isWriteMethod && this.mode === MODES.DUAL_WRITE) {
      proxiedMethod = this._createDualWriteProxy(methodName);
    } else {
      // Just delegate to primary
      proxiedMethod = (...args) => primaryMethod.apply(this.primary, args);
    }
    
    this._methodCache.set(methodName, proxiedMethod);
    return proxiedMethod;
  }

  /**
   * Check if a method name indicates a write operation
   * @param {string} methodName
   * @returns {boolean}
   */
  _isWriteMethod(methodName) {
    const writePatterns = [
      /^insert/i, /^update/i, /^delete/i, /^upsert/i,
      /^add/i, /^remove/i, /^set/i, /^save/i,
      /^record/i, /^create/i, /^mark/i
    ];
    return writePatterns.some(p => p.test(methodName));
  }

  // ─────────────────────────────────────────────────────────────
  // Passthrough to Primary (common methods)
  // ─────────────────────────────────────────────────────────────

  // These methods delegate to primary and dual-write when needed

  upsertArticle(...args) {
    return this.getMethod('upsertArticle')(...args);
  }

  getArticle(...args) {
    return this.primary?.getArticle?.(...args);
  }

  getArticleByUrl(...args) {
    return this.primary?.getArticleByUrl?.(...args);
  }

  createAnalysePagesCoreQueries() {
    return this.primary?.createAnalysePagesCoreQueries?.();
  }

  createArticleXPathPatternQueries() {
    return this.primary?.createArticleXPathPatternQueries?.();
  }

  // Expose common properties
  get db() {
    return this.getHandle();
  }

  // ─────────────────────────────────────────────────────────────
  // Logging (quiet by default)
  // ─────────────────────────────────────────────────────────────

  _log(level, message) {
    if (this.quietLogging && level === 'debug') return;
    this.emit('log', { level, message, timestamp: new Date().toISOString() });
  }
}

// ─────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────

/**
 * Create a DualDatabaseFacade from configuration
 * @param {DualDatabaseConfig|string} config - Config object or path to JSON file
 * @returns {Promise<DualDatabaseFacade>}
 */
async function createDualDatabase(config) {
  let resolvedConfig = config;
  
  // Load from file if string path
  if (typeof config === 'string') {
    const configPath = path.resolve(config);
    if (fs.existsSync(configPath)) {
      resolvedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      // Treat as simple dbPath for single mode
      resolvedConfig = {
        mode: MODES.SINGLE,
        primary: { engine: 'sqlite', dbPath: config }
      };
    }
  }
  
  const facade = new DualDatabaseFacade(resolvedConfig);
  await facade.initialize();
  return facade;
}

/**
 * Load configuration from environment variables
 * @returns {DualDatabaseConfig}
 */
function loadConfigFromEnv() {
  const config = {
    mode: process.env.DB_MODE || MODES.SINGLE,
    primary: {
      engine: process.env.DB_PRIMARY_ENGINE || 'sqlite',
      dbPath: process.env.DB_PRIMARY_PATH || process.env.NEWS_DB_PATH || 'data/news.db'
    },
    quietLogging: process.env.DB_QUIET !== 'false'
  };
  
  // Add connection string for postgres
  if (config.primary.engine === 'postgres') {
    config.primary.connectionString = process.env.DB_PRIMARY_CONNECTION || process.env.DATABASE_URL;
  }
  
  // Secondary database
  if (process.env.DB_SECONDARY_ENGINE) {
    config.secondary = {
      engine: process.env.DB_SECONDARY_ENGINE,
      dbPath: process.env.DB_SECONDARY_PATH,
      connectionString: process.env.DB_SECONDARY_CONNECTION
    };
  }
  
  return config;
}

module.exports = {
  DualDatabaseFacade,
  createDualDatabase,
  loadConfigFromEnv,
  MODES
};
