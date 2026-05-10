"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.configuration");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => {
    return {
      listSettings: handle.prepare(`
        SELECT key, value, updated_at AS updatedAt
        FROM crawler_settings
        ORDER BY key ASC
      `)
    };
  });
}

function listConfiguration(db) {
  const { listSettings } = prepareStatements(db);
  return listSettings.all();
}

module.exports = {
  listConfiguration
};
