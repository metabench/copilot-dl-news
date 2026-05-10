"use strict";

const adapters = new Map();
let globalInstance = null;

function normalizeOptions(input) {
  const envEngine = process.env.DB_ENGINE || process.env.NEWS_DB_ENGINE;
  if (typeof input === "string") {
    let engine = envEngine ? String(envEngine).toLowerCase() : "sqlite";
    // Auto-detect postgres from connection string
    if (input.startsWith('postgres://') || input.startsWith('postgresql://')) {
      engine = 'postgres';
    }

    const opts = {
      engine,
      dbPath: input
    };
    
    // Map dbPath to connectionString for postgres
    if (engine === 'postgres') {
      opts.connectionString = input;
    }
    
    return opts;
  }
  const options = { ...(input || {}) };
  const preferredEngine = options.engine || options.adapter || envEngine || "sqlite";
  options.engine = String(preferredEngine).toLowerCase();
  
  // Map dbPath to connectionString if needed
  if (options.engine === 'postgres' && options.dbPath && !options.connectionString) {
    options.connectionString = options.dbPath;
  }
  
  return options;
}

function registerAdapter(name, factory) {
  if (!name || typeof name !== "string") {
    throw new Error("registerAdapter requires a string name");
  }
  if (typeof factory !== "function") {
    throw new Error(`registerAdapter('${name}') expected a factory function`);
  }
  const key = name.toLowerCase();
  adapters.set(key, factory);
}

function getAdapter(name) {
  return adapters.get(String(name).toLowerCase()) || null;
}

function getRegisteredAdapters() {
  return Array.from(adapters.keys()).sort();
}

function resolveNewsCrawlerDbFactory() {
  try {
    // Optional external module for drop-in DB replacement.
    const candidates = ["news-crawler-db", "news-crawler-db/dist/db"];
    let lastError = null;

    for (const id of candidates) {
      try {
        const mod = require(id);
        if (typeof mod.createDatabase === "function") return mod.createDatabase;
        if (typeof mod.createDbAdapter === "function") {
          return (options = {}) => {
            const type = options.type || options.engine || options.adapter || "sqlite";
            const config = { type };
            if (type === "sqlite") {
              config.path = options.path || options.dbPath || options.dbFilePath;
            } else if (type === "postgres") {
              config.connectionString =
                options.connectionString || options.dbPath || options.dbFilePath;
            }
            return mod.createDbAdapter(config);
          };
        }
        if (typeof mod.createSQLiteDatabase === "function") return mod.createSQLiteDatabase;
        if (mod.dbAdapter) {
          return () => mod.dbAdapter;
        }
        if (typeof mod.default === "function") return mod.default;
        if (typeof mod === "function") return mod;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error("news-crawler-db module has no compatible factory export");
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (err && (err.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(msg))) {
      throw new Error("news-crawler-db adapter requested but module is not installed. Add it to dependencies or set NODE_PATH to the package.");
    }
    throw new Error(`news-crawler-db adapter failed to load: ${msg}`);
  }
}

function createDatabase(inputOptions) {
  const normalized = normalizeOptions(inputOptions);
  const { engine, ...adapterOptions } = normalized;
  const factory = getAdapter(engine);
  if (!factory) {
    const available = getRegisteredAdapters();
    throw new Error(`No database adapter registered for engine '${engine}'. Available adapters: ${available.join(", ") || "<none>"}`);
  }
  return factory({ engine, ...adapterOptions });
}

/**
 * Get or create the singleton database instance.
 * If options are provided, they are used to create the instance if it doesn't exist.
 * If no options are provided and no instance exists, it attempts to find default paths.
 */
function getDb(options = null) {
  if (globalInstance) {
    return globalInstance;
  }

  // If options provided, use them
  if (options) {
    globalInstance = createDatabase(options);
    return globalInstance;
  }

  // Try to auto-discover defaults
  const path = require('path');
  const fs = require('fs');
  
  // Common locations for the DB
  const candidates = [
    process.env.NEWS_DB_PATH,
    path.join(process.cwd(), 'data', 'news.db'),
    path.join(__dirname, '../../data/news.db')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        globalInstance = createDatabase({
          engine: 'sqlite',
          dbPath: candidate
        });
        return globalInstance;
      } catch (err) {
        // Continue to next candidate
      }
    }
  }

  throw new Error('getDb(): Could not find database. Please pass options or ensure data/news.db exists.');
}

/**
 * Reset the global singleton (useful for testing)
 */
function resetDb() {
  if (globalInstance && typeof globalInstance.close === 'function') {
    try {
      globalInstance.close();
    } catch (e) {
      // Ignore close errors
    }
  }
  globalInstance = null;
}

class NewsDatabaseFacade {
  constructor(inputOptions) {
    const instance = createDatabase(inputOptions);
    return instance;
  }
}

registerAdapter("sqlite", (options) => {
  const { createNewsCrawlerDbCompat } = require("./newsCrawlerDbCompat");
  return createNewsCrawlerDbCompat(options);
});

registerAdapter("legacy-sqlite", (options) => {
  const { createSQLiteDatabase } = require("./sqlite");
  return createSQLiteDatabase(options);
});

registerAdapter("postgres", (options) => {
  const { createPostgresDatabase } = require("./postgres");
  return createPostgresDatabase(options);
});

registerAdapter("news-crawler-db", (options) => {
  const { createNewsCrawlerDbCompat } = require("./newsCrawlerDbCompat");
  return createNewsCrawlerDbCompat(options);
});

registerAdapter("news-crawler", (options) => {
  const { createNewsCrawlerDbCompat } = require("./newsCrawlerDbCompat");
  return createNewsCrawlerDbCompat(options);
});

module.exports = NewsDatabaseFacade;
module.exports.createDatabase = createDatabase;
module.exports.getDb = getDb;
module.exports.resetDb = resetDb;
module.exports.registerAdapter = registerAdapter;
module.exports.getRegisteredAdapters = getRegisteredAdapters;
module.exports.normalizeOptions = normalizeOptions;
module.exports.getAdapter = getAdapter;
module.exports.adapters = adapters;
