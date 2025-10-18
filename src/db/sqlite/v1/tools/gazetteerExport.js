"use strict";

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("gazetteer export helpers require a better-sqlite3 Database instance");
  }
}

function handleMissingTable(error) {
  if (error && /no such table/i.test(error.message)) {
    return [];
  }
  throw error;
}

function safeIterateAll(db, tableName) {
  assertDatabase(db);
  try {
    return db.prepare(`SELECT * FROM ${tableName}`).iterate();
  } catch (error) {
    return handleMissingTable(error);
  }
}

function iteratePlaceSources(db) {
  return safeIterateAll(db, "place_sources");
}

function iteratePlaces(db) {
  return safeIterateAll(db, "places");
}

function iteratePlaceNames(db) {
  return safeIterateAll(db, "place_names");
}

function iteratePlaceHierarchy(db) {
  return safeIterateAll(db, "place_hierarchy");
}

function iteratePlaceExternalIds(db) {
  return safeIterateAll(db, "place_external_ids");
}

module.exports = {
  iteratePlaceSources,
  iteratePlaces,
  iteratePlaceNames,
  iteratePlaceHierarchy,
  iteratePlaceExternalIds,
  safeIterateAll
};
