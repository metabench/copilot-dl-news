'use strict';

/**
 * StorageServices - Caching and persistence services.
 *
 * Groups:
 * - cache: In-memory or persistent cache
 * - dbAdapter: Database adapter
 * - articleStorage: Article persistence
 * - storage (facade): Unified storage interface
 *
 * @param {ServiceContainer} container - The service container
 * @param {Object} config - Crawler configuration
 * @param {Object} options - Additional options (db, cache instances)
 */
function registerStorageServices(container, config, options = {}) {
  // Cache (in-memory by default)
  container.register('cache', (c) => {
    // Use provided cache if available
    if (options.cache) {
      return options.cache;
    }

    // Create simple in-memory cache
    return {
      _store: new Map(),
      _maxSize: config.cacheMaxSize || 10000,

      get(key) {
        const entry = this._store.get(key);
        if (!entry) return null;

        // Check expiry
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          this._store.delete(key);
          return null;
        }

        return entry.value;
      },

      set(key, value, ttlMs = null) {
        // Evict oldest if at capacity
        if (this._store.size >= this._maxSize) {
          const firstKey = this._store.keys().next().value;
          this._store.delete(firstKey);
        }

        this._store.set(key, {
          value,
          expiresAt: ttlMs ? Date.now() + ttlMs : null,
          createdAt: Date.now()
        });
      },

      has(key) {
        return this.get(key) !== null;
      },

      delete(key) {
        this._store.delete(key);
      },

      clear() {
        this._store.clear();
      },

      size() {
        return this._store.size;
      }
    };
  }, { group: 'storage' });

  // Database adapter
  container.register('dbAdapter', (c) => {
    // Use provided db if available
    if (options.db) {
      return options.db;
    }

    // Try to load SQLite adapter
    try {
      const SQLiteAdapter = require('../../../db/sqlite/SQLiteAdapter');
      return new SQLiteAdapter({
        path: config.dbPath || 'data/news.db'
      });
    } catch (e) {
      // Return null adapter that logs operations
      return {
        _operations: [],

        async query(sql, params) {
          this._operations.push({ type: 'query', sql, params });
          return [];
        },

        async run(sql, params) {
          this._operations.push({ type: 'run', sql, params });
          return { changes: 0 };
        },

        async close() {
          // No-op
        },

        getOperations() {
          return this._operations;
        }
      };
    }
  }, { group: 'storage' });

  // Article storage
  container.register('articleStorage', (c) => {
    const dbAdapter = c.get('dbAdapter');
    const cache = c.get('cache');

    return {
      /**
       * Store an article.
       * @param {Object} article
       * @returns {Promise<Object>}
       */
      async store(article) {
        // Cache first
        if (article.url) {
          cache.set(`article:${article.url}`, article, 3600000); // 1 hour TTL
        }

        // Persist to DB if available
        if (dbAdapter.run) {
          try {
            await dbAdapter.run(
              `INSERT OR REPLACE INTO articles (url, title, content, crawled_at) VALUES (?, ?, ?, ?)`,
              [article.url, article.title, article.content, Date.now()]
            );
          } catch (e) {
            // Log but don't fail
            console.warn('Failed to store article:', e.message);
          }
        }

        return article;
      },

      /**
       * Retrieve an article by URL.
       * @param {string} url
       * @returns {Promise<Object|null>}
       */
      async get(url) {
        // Check cache first
        const cached = cache.get(`article:${url}`);
        if (cached) return cached;

        // Query DB
        if (dbAdapter.query) {
          try {
            const rows = await dbAdapter.query(
              `SELECT * FROM articles WHERE url = ?`,
              [url]
            );
            if (rows.length > 0) {
              cache.set(`article:${url}`, rows[0], 3600000);
              return rows[0];
            }
          } catch (e) {
            // Ignore
          }
        }

        return null;
      },

      /**
       * Check if article exists.
       * @param {string} url
       * @returns {Promise<boolean>}
       */
      async exists(url) {
        return (await this.get(url)) !== null;
      }
    };
  }, { group: 'storage', dependencies: ['dbAdapter', 'cache'] });

  // URL decision cache (separate from general cache)
  container.register('urlDecisionCache', (c) => {
    const cache = c.get('cache');

    return {
      /**
       * Get cached decision for URL.
       * @param {string} url
       * @returns {Object|null}
       */
      get(url) {
        return cache.get(`decision:${url}`);
      },

      /**
       * Cache a decision.
       * @param {string} url
       * @param {Object} decision
       * @param {number} ttlMs
       */
      set(url, decision, ttlMs = 300000) { // 5 min default
        cache.set(`decision:${url}`, decision, ttlMs);
      },

      /**
       * Invalidate a cached decision.
       * @param {string} url
       */
      invalidate(url) {
        cache.delete(`decision:${url}`);
      }
    };
  }, { group: 'storage', dependencies: ['cache'] });

  // Storage facade
  container.register('storage', (c) => {
    return {
      cache: c.get('cache'),
      db: c.get('dbAdapter'),
      articles: c.get('articleStorage'),
      decisions: c.get('urlDecisionCache'),

      /**
       * Store an article.
       * @param {Object} article
       */
      async storeArticle(article) {
        return c.get('articleStorage').store(article);
      },

      /**
       * Get an article.
       * @param {string} url
       */
      async getArticle(url) {
        return c.get('articleStorage').get(url);
      },

      /**
       * Cache a value.
       * @param {string} key
       * @param {any} value
       * @param {number} ttlMs
       */
      cacheSet(key, value, ttlMs) {
        c.get('cache').set(key, value, ttlMs);
      },

      /**
       * Get cached value.
       * @param {string} key
       */
      cacheGet(key) {
        return c.get('cache').get(key);
      },

      /**
       * Close all storage connections.
       */
      async close() {
        const db = c.get('dbAdapter');
        if (db && typeof db.close === 'function') {
          await db.close();
        }
      }
    };
  }, { group: 'facades', dependencies: ['cache', 'dbAdapter', 'articleStorage', 'urlDecisionCache'] });
}

module.exports = { registerStorageServices };
