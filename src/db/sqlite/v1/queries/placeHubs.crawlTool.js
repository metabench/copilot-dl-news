'use strict';

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createCrawlPlaceHubsQueries requires a better-sqlite3 database handle');
  }
}

function createCrawlPlaceHubsQueries(db) {
  assertDatabase(db);

  const selectAllStmt = db.prepare(`
    SELECT url, host, place_slug, title
      FROM place_hubs
     ORDER BY host, place_slug
  `);

  const selectByHostStmt = db.prepare(`
    SELECT url, host, place_slug, title
      FROM place_hubs
     WHERE host = ?
     ORDER BY host, place_slug
  `);

  function listPlaceHubs(options = {}) {
    const host = typeof options.host === 'string' ? options.host.trim() : '';
    if (host) {
      return selectByHostStmt.all(host);
    }
    return selectAllStmt.all();
  }

  return {
    listPlaceHubs
  };
}

module.exports = { createCrawlPlaceHubsQueries };
