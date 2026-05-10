const { selectRecentDomains } = require('../../../data/db/sqlite/v1/queries/ui/recentDomains");

function getRecentDomains(urlsDbPath, limit) {
  // Back-compat test hook: if requiring '../../db' fails (e.g., better-sqlite3 missing), return empty
  try {
    const path = require('path');
    const dbModulePath = path.join(__dirname, '..', '..', '..', 'db');
    require(dbModulePath);
  } catch (_) {
    return { count: 0, totalSeen: 0, limit, domains: [] };
  }
  let openDbReadOnly;
  try { ({ openDbReadOnly } = require('../../../data/db/sqlite')); } catch (e) {
    // Graceful fallback: return empty list so UI shows 'No recent domains' instead of failing
    return { count: 0, totalSeen: 0, limit, domains: [] };
  }
  try {
    const db = openDbReadOnly(urlsDbPath);
    // Strategy:
    // 1) Pull top-N recent URLs by fetched_at and crawled_at separately using their indexes
    // 2) Union and re-sort a small window, join urls for host, then aggregate
    const windowN = 2000; // small bounded window for speed; adjusted for large DBs
    const rows = selectRecentDomains(db, { windowSize: windowN, limit });
    const totalSeen = rows.length; // distinct hosts returned in this window
    try { db.close(); } catch (_) {}
    return { count: rows.length, totalSeen, limit, domains: rows };
  } catch (e) {
    // Graceful fallback: empty domains list on any error
    return { count: 0, totalSeen: 0, limit, domains: [] };
  }
}

module.exports = { getRecentDomains };