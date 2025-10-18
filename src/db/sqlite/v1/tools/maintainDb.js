'use strict';

function ensureDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('maintainDb helpers require a database handle with prepare()');
  }
  return db;
}

function countPlaces(dbSource) {
  const db = ensureDb(dbSource);
  const row = db.prepare('SELECT COUNT(*) AS c FROM places').get();
  return row?.c || 0;
}

function countPlaceNames(dbSource) {
  const db = ensureDb(dbSource);
  const row = db.prepare('SELECT COUNT(*) AS c FROM place_names').get();
  return row?.c || 0;
}

function normalizePlaceNames(dbSource) {
  const db = ensureDb(dbSource);
  try {
    const info = db.prepare(`UPDATE place_names SET normalized = LOWER(TRIM(name)) WHERE (normalized IS NULL OR TRIM(normalized) = '') AND name IS NOT NULL`).run();
    return info?.changes || 0;
  } catch (_) {
    return 0;
  }
}

function trimPlaceNames(dbSource) {
  const db = ensureDb(dbSource);
  try {
    db.exec(`UPDATE place_names SET name=TRIM(name) WHERE name <> TRIM(name);`);
    return true;
  } catch (_) {
    return false;
  }
}

function deleteEmptyPlaceNames(dbSource) {
  const db = ensureDb(dbSource);
  try {
    const info = db.prepare(`DELETE FROM place_names WHERE name IS NULL OR TRIM(name) = ''`).run();
    return info?.changes || 0;
  } catch (_) {
    return 0;
  }
}

function deleteNamelessPlaces(dbSource) {
  const db = ensureDb(dbSource);
  try {
    const info = db.prepare(`
      DELETE FROM places
      WHERE (canonical_name_id IS NULL OR canonical_name_id NOT IN (SELECT id FROM place_names))
        AND NOT EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = places.id)
    `).run();
    return info?.changes || 0;
  } catch (_) {
    return 0;
  }
}

module.exports = {
  countPlaces,
  countPlaceNames,
  normalizePlaceNames,
  trimPlaceNames,
  deleteEmptyPlaceNames,
  deleteNamelessPlaces
};
