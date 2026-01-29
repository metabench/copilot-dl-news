'use strict';

const path = require('path');
const fs = require('fs');

/**
 * QueueFactory — Creates URL queue adapters based on configuration
 * 
 * Supports multiple backends:
 * - sqlite: SQLite-backed queue (default, single-process)
 * - postgres: Postgres-backed queue (distributed, multi-worker)
 * 
 * Configuration can be provided via:
 * 1. Direct options to create()
 * 2. config/queue.json file
 * 3. Environment variables (POSTGRES_URL, etc.)
 * 
 * @example
 * // Use default config (SQLite)
 * const queue = await QueueFactory.create();
 * 
 * // Force Postgres backend
 * const queue = await QueueFactory.create({ backend: 'postgres' });
 * 
 * // Custom config path
 * const queue = await QueueFactory.create({ configPath: './my-queue-config.json' });
 * 
 * @module src/queue/QueueFactory
 */
class QueueFactory {
  /**
   * Create a URL queue adapter based on configuration.
   * 
   * @param {Object} [options]
   * @param {string} [options.configPath] - Path to queue config JSON file
   * @param {string} [options.backend] - Override backend: 'sqlite' | 'postgres'
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.sqliteOptions] - SQLite-specific options
   * @param {Object} [options.postgresOptions] - Postgres-specific options
   * @returns {Promise<import('./IUrlQueue').IUrlQueue>}
   */
  static async create(options = {}) {
    const config = QueueFactory._loadConfig(options.configPath);
    const backend = options.backend || config.backend || 'sqlite';
    const logger = options.logger || console;

    logger.info?.(`[QueueFactory] Creating ${backend} queue adapter`);

    switch (backend) {
      case 'sqlite':
        return QueueFactory._createSqlite(
          { ...config.sqlite, ...options.sqliteOptions },
          { logger }
        );
      
      case 'postgres':
        return QueueFactory._createPostgres(
          { ...config.postgres, ...options.postgresOptions },
          { logger }
        );
      
      default:
        throw new Error(`Unknown queue backend: ${backend}. Supported: sqlite, postgres`);
    }
  }

  /**
   * Load configuration from file or return defaults.
   * @private
   * @param {string} [configPath]
   * @returns {Object}
   */
  static _loadConfig(configPath) {
    const defaultPath = path.join(process.cwd(), 'config', 'queue.json');
    const targetPath = configPath || defaultPath;

    if (fs.existsSync(targetPath)) {
      try {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const parsed = JSON.parse(raw);
        
        // Substitute environment variables in connection strings
        if (parsed.postgres?.connectionString) {
          parsed.postgres.connectionString = QueueFactory._substituteEnvVars(
            parsed.postgres.connectionString
          );
        }
        
        return parsed;
      } catch (err) {
        console.warn(`[QueueFactory] Failed to load config from ${targetPath}: ${err.message}`);
      }
    }

    // Default configuration
    return {
      backend: 'sqlite',
      sqlite: {
        dbPath: 'data/news.db',
        tableName: 'crawl_queue'
      },
      postgres: {
        connectionString: process.env.POSTGRES_URL || null,
        tableName: 'url_queue',
        poolSize: 10
      },
      options: {
        maxRetries: 3,
        retryDelayMs: 5000,
        staleTimeoutMs: 300000 // 5 minutes
      }
    };
  }

  /**
   * Substitute ${ENV_VAR} patterns in strings.
   * @private
   * @param {string} str
   * @returns {string}
   */
  static _substituteEnvVars(str) {
    if (typeof str !== 'string') return str;
    
    return str.replace(/\$\{(\w+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  /**
   * Create SQLite queue adapter.
   * @private
   * @param {Object} config
   * @param {Object} options
   * @returns {Promise<import('./IUrlQueue').IUrlQueue>}
   */
  static async _createSqlite(config, options) {
    const { SqliteUrlQueueAdapter } = require('./SqliteUrlQueueAdapter');
    
    const adapter = new SqliteUrlQueueAdapter({
      dbPath: config.dbPath || 'data/news.db',
      tableName: config.tableName || 'crawl_queue',
      logger: options.logger
    });
    
    await adapter.initialize();
    return adapter;
  }

  /**
   * Create Postgres queue adapter.
   * @private
   * @param {Object} config
   * @param {Object} options
   * @returns {Promise<import('./IUrlQueue').IUrlQueue>}
   */
  static async _createPostgres(config, options) {
    const { PostgresUrlQueueAdapter } = require('./PostgresUrlQueueAdapter');
    
    const adapter = new PostgresUrlQueueAdapter({
      connectionString: config.connectionString || process.env.POSTGRES_URL,
      tableName: config.tableName || 'url_queue',
      poolSize: config.poolSize || 10,
      logger: options.logger
    });
    
    await adapter.initialize();
    return adapter;
  }

  /**
   * Get the current configuration without creating an adapter.
   * Useful for inspection/debugging.
   * 
   * @param {string} [configPath]
   * @returns {Object}
   */
  static getConfig(configPath) {
    return QueueFactory._loadConfig(configPath);
  }

  /**
   * List available backend types.
   * @returns {string[]}
   */
  static getAvailableBackends() {
    return ['sqlite', 'postgres'];
  }
}

module.exports = { QueueFactory };
