"use strict";

/**
 * @module ui/placeHubs
 * @description Queries for viewing place hubs discovered by the crawler.
 * 
 * Place hubs are pages on news websites that focus on a specific geographic place
 * (country, city, region). For example, "The Guardian > World > Australia" hub.
 */

/**
 * List place hubs with optional filtering and pagination.
 * 
 * @param {Database} db - better-sqlite3 database handle
 * @param {Object} options
 * @param {string} [options.host] - Filter by host (exact match)
 * @param {string} [options.hostLike] - Filter by host (LIKE pattern)
 * @param {string} [options.placeSlug] - Filter by place slug
 * @param {string} [options.placeKind] - Filter by place kind (e.g., 'country', 'city', 'region')
 * @param {string} [options.topicSlug] - Filter by topic slug
 * @param {string} [options.search] - Search across place_slug, title, topic_label
 * @param {string} [options.sortBy] - Column to sort by (default: 'last_seen_at')
 * @param {string} [options.sortDir] - Sort direction: 'ASC' or 'DESC' (default: 'DESC')
 * @param {number} [options.limit] - Max rows (default: 100)
 * @param {number} [options.offset] - Offset for pagination (default: 0)
 * @returns {Array} Array of place hub records
 */
function listPlaceHubs(db, options = {}) {
  const {
    host,
    hostLike,
    placeSlug,
    placeKind,
    topicSlug,
    search,
    sortBy = 'last_seen_at',
    sortDir = 'DESC',
    limit = 100,
    offset = 0
  } = options;

  const conditions = [];
  const params = [];

  if (host) {
    conditions.push('ph.host = ?');
    params.push(host);
  }
  if (hostLike) {
    conditions.push('ph.host LIKE ?');
    params.push(`%${hostLike}%`);
  }
  if (placeSlug) {
    conditions.push('ph.place_slug = ?');
    params.push(placeSlug);
  }
  if (placeKind) {
    conditions.push('ph.place_kind = ?');
    params.push(placeKind);
  }
  if (topicSlug) {
    conditions.push('ph.topic_slug = ?');
    params.push(topicSlug);
  }
  if (search) {
    conditions.push('(ph.place_slug LIKE ? OR ph.title LIKE ? OR ph.topic_label LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Whitelist sort columns
  const validSortColumns = ['id', 'host', 'place_slug', 'title', 'place_kind', 'topic_slug', 'last_seen_at', 'first_seen_at', 'nav_links_count', 'article_links_count'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'last_seen_at';
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const sql = `
    SELECT 
      ph.id,
      ph.host,
      ph.place_slug,
      ph.title,
      ph.place_kind,
      ph.topic_slug,
      ph.topic_label,
      ph.topic_kind,
      ph.nav_links_count,
      ph.article_links_count,
      ph.first_seen_at,
      ph.last_seen_at,
      ph.url_id,
      u.url
    FROM place_hubs ph
    LEFT JOIN urls u ON ph.url_id = u.id
    ${whereClause}
    ORDER BY ph.${safeSortBy} ${safeSortDir}
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

/**
 * Count place hubs matching the given filters.
 * 
 * @param {Database} db
 * @param {Object} options - Same filters as listPlaceHubs
 * @returns {number} Count of matching records
 */
function countPlaceHubs(db, options = {}) {
  const {
    host,
    hostLike,
    placeSlug,
    placeKind,
    topicSlug,
    search
  } = options;

  const conditions = [];
  const params = [];

  if (host) {
    conditions.push('host = ?');
    params.push(host);
  }
  if (hostLike) {
    conditions.push('host LIKE ?');
    params.push(`%${hostLike}%`);
  }
  if (placeSlug) {
    conditions.push('place_slug = ?');
    params.push(placeSlug);
  }
  if (placeKind) {
    conditions.push('place_kind = ?');
    params.push(placeKind);
  }
  if (topicSlug) {
    conditions.push('topic_slug = ?');
    params.push(topicSlug);
  }
  if (search) {
    conditions.push('(place_slug LIKE ? OR title LIKE ? OR topic_label LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT COUNT(*) as count FROM place_hubs ${whereClause}`;

  const row = db.prepare(sql).get(...params);
  return row?.count || 0;
}

/**
 * Get a single place hub by ID.
 * 
 * @param {Database} db
 * @param {number} id
 * @returns {Object|null}
 */
function getPlaceHubById(db, id) {
  const sql = `
    SELECT 
      ph.*,
      u.url
    FROM place_hubs ph
    LEFT JOIN urls u ON ph.url_id = u.id
    WHERE ph.id = ?
  `;
  return db.prepare(sql).get(id);
}

/**
 * Get place hub statistics grouped by host.
 * 
 * @param {Database} db
 * @param {Object} options
 * @param {number} [options.limit] - Max hosts to return (default: 50)
 * @returns {Array} Array of { host, hubCount, placeKinds, latestSeen }
 */
function getPlaceHubsByHost(db, options = {}) {
  const { limit = 50 } = options;

  const sql = `
    SELECT 
      host,
      COUNT(*) as hub_count,
      GROUP_CONCAT(DISTINCT place_kind) as place_kinds,
      MAX(last_seen_at) as latest_seen
    FROM place_hubs
    WHERE place_slug IS NOT NULL
    GROUP BY host
    ORDER BY hub_count DESC
    LIMIT ?
  `;

  return db.prepare(sql).all(limit);
}

/**
 * Get place hub statistics grouped by place_kind.
 * 
 * @param {Database} db
 * @returns {Array} Array of { placeKind, count }
 */
function getPlaceHubsByKind(db) {
  const sql = `
    SELECT 
      COALESCE(place_kind, 'unknown') as place_kind,
      COUNT(*) as count
    FROM place_hubs
    GROUP BY place_kind
    ORDER BY count DESC
  `;

  return db.prepare(sql).all();
}

/**
 * Get distinct hosts that have place hubs.
 * 
 * @param {Database} db
 * @returns {Array} Array of host strings
 */
function getPlaceHubHosts(db) {
  const sql = `
    SELECT DISTINCT host
    FROM place_hubs
    ORDER BY host
  `;

  return db.prepare(sql).all().map(r => r.host);
}

module.exports = {
  listPlaceHubs,
  countPlaceHubs,
  getPlaceHubById,
  getPlaceHubsByHost,
  getPlaceHubsByKind,
  getPlaceHubHosts
};
