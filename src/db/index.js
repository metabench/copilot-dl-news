"use strict";

const adapters = new Map();

function normalizeOptions(input) {
  const envEngine = process.env.DB_ENGINE || process.env.NEWS_DB_ENGINE;
  if (typeof input === "string") {
    return {
      engine: envEngine ? String(envEngine).toLowerCase() : "sqlite",
      dbPath: input
    };
  }
  const options = { ...(input || {}) };
  const preferredEngine = options.engine || options.adapter || envEngine || "sqlite";
  options.engine = String(preferredEngine).toLowerCase();
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

class NewsDatabaseFacade {
  constructor(inputOptions) {
    const instance = createDatabase(inputOptions);
    return instance;
  }
}

registerAdapter("sqlite", (options) => {
  const { createSQLiteDatabase } = require("./sqlite");
  return createSQLiteDatabase(options);
});

module.exports = NewsDatabaseFacade;
module.exports.createDatabase = createDatabase;
module.exports.registerAdapter = registerAdapter;
module.exports.getRegisteredAdapters = getRegisteredAdapters;
module.exports.normalizeOptions = normalizeOptions;
module.exports.getAdapter = getAdapter;
module.exports.adapters = adapters;
