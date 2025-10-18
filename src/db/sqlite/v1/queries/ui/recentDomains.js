"use strict";

function selectRecentDomains(db, { windowSize, limit }) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectRecentDomains requires a database handle");
  }
  const windowN = Number(windowSize) || 2000;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
  const stmt = db.prepare(`
    WITH recent AS (
      SELECT * FROM (
        SELECT url, fetched_at AS ts FROM articles WHERE fetched_at IS NOT NULL ORDER BY fetched_at DESC LIMIT ?
      )
      UNION ALL
      SELECT * FROM (
        SELECT url, crawled_at AS ts FROM articles WHERE crawled_at IS NOT NULL ORDER BY crawled_at DESC LIMIT ?
      )
    ), windowed AS (
      SELECT url, ts FROM recent ORDER BY ts DESC LIMIT ?
    )
    SELECT LOWER(u.host) AS host,
           COUNT(*) AS article_count,
           MAX(w.ts) AS last_saved_at
    FROM windowed w
    JOIN urls u ON u.url = w.url
    WHERE u.host IS NOT NULL AND TRIM(u.host) <> ''
    GROUP BY LOWER(u.host)
    ORDER BY last_saved_at DESC
    LIMIT ?
  `);
  return stmt.all(windowN, windowN, windowN, safeLimit);
}

module.exports = {
  selectRecentDomains
};
