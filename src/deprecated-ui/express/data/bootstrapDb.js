const path = require('path');
const {
  loadBootstrapData,
  readDatasetFromFile,
  resolveDefaultDatasetPath,
  isBootstrapSafeToRun
} = require('../../../bootstrap/bootstrapDbLoader');

function assertDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('bootstrap-db data helpers require a writable better-sqlite3 Database');
  }
}

function getBootstrapDatasetPath(customPath) {
  return customPath ? path.resolve(customPath) : resolveDefaultDatasetPath();
}

function fetchBootstrapDbStatus(db) {
  assertDb(db);
  const countryCount = db.prepare(`SELECT COUNT(*) AS c FROM places WHERE kind='country'`).get()?.c || 0;
  const topicCount = db.prepare(`SELECT COUNT(*) AS c FROM topic_keywords`).get()?.c || 0;
  const skipCount = db.prepare(`SELECT COUNT(*) AS c FROM crawl_skip_terms`).get()?.c || 0;
  const sourceRow = db.prepare(`SELECT name, version, url, license FROM place_sources WHERE name = 'bootstrap-db' LIMIT 1`).get() || null;
  return {
    countries: countryCount,
    topicKeywords: topicCount,
    skipTerms: skipCount,
    source: sourceRow,
    safeToBootstrap: isBootstrapSafeToRun(db)
  };
}

function loadBootstrapDb({ db, datasetPath = null, source = 'bootstrap-db@ui', logger = console, force = false } = {}) {
  assertDb(db);
  const resolvedPath = getBootstrapDatasetPath(datasetPath);
  const safe = isBootstrapSafeToRun(db);
  if (!force && !safe) {
    const error = new Error('Bootstrap aborted: existing database contains entries not created by bootstrap-db. Pass force=true to override.');
    error.code = 'BOOTSTRAP_UNSAFE';
    error.safeToBootstrap = false;
    throw error;
  }
  const payload = readDatasetFromFile(resolvedPath);
  return loadBootstrapData({ db, dataset: payload, source, logger });
}

module.exports = {
  fetchBootstrapDbStatus,
  loadBootstrapDb,
  getBootstrapDatasetPath
};
