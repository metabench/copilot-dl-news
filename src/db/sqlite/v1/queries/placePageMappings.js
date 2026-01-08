'use strict';

const DEFAULT_PAGE_KIND = 'country-hub';

function normalizeHost(host) {
  return (host || '').trim().toLowerCase();
}

function serializeEvidence(evidence) {
  if (!evidence) return null;
  if (typeof evidence === 'string') return evidence;
  try {
    return JSON.stringify(evidence);
  } catch (error) {
    return null;
  }
}

function parseEvidence(evidence) {
  if (!evidence) return null;
  if (typeof evidence === 'object') return evidence;
  if (typeof evidence !== 'string') return null;
  try {
    return JSON.parse(evidence);
  } catch (error) {
    return null;
  }
}

function upsertPlacePageMapping(db, {
  placeId,
  host,
  url,
  pageKind = DEFAULT_PAGE_KIND,
  status = 'pending',
  publisher = null,
  hubId = null,
  evidence = null,
  verifiedAt = null,
  timestamp = new Date().toISOString()
}) {
  if (!placeId) {
    throw new Error('upsertPlacePageMapping requires placeId');
  }
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) {
    throw new Error('upsertPlacePageMapping requires host');
  }
  if (!url) {
    throw new Error('upsertPlacePageMapping requires url');
  }

  const stmt = db.prepare(`
    INSERT INTO place_page_mappings (
      place_id,
      host,
      url,
      page_kind,
      publisher,
      status,
      first_seen_at,
      last_seen_at,
      verified_at,
      evidence,
      hub_id
    ) VALUES (@placeId, @host, @url, @pageKind, @publisher, @status, @firstSeenAt, @lastSeenAt, @verifiedAt, @evidence, @hubId)
    ON CONFLICT(place_id, host, page_kind)
    DO UPDATE SET
      url = excluded.url,
      publisher = COALESCE(excluded.publisher, place_page_mappings.publisher),
      status = excluded.status,
      last_seen_at = excluded.last_seen_at,
      verified_at = CASE WHEN excluded.verified_at IS NOT NULL THEN excluded.verified_at ELSE place_page_mappings.verified_at END,
      evidence = COALESCE(excluded.evidence, place_page_mappings.evidence),
      hub_id = COALESCE(excluded.hub_id, place_page_mappings.hub_id)
  `);

  return stmt.run({
    placeId,
    host: normalizedHost,
    url,
    pageKind,
    publisher,
    status,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    verifiedAt,
    evidence: serializeEvidence(evidence),
    hubId
  });
}

function upsertAbsentPlacePageMapping(db, {
  placeId,
  host,
  url,
  pageKind = DEFAULT_PAGE_KIND,
  evidence = null,
  verifiedAt = new Date().toISOString(),
  timestamp = verifiedAt
}) {
  if (!placeId) {
    throw new Error('upsertAbsentPlacePageMapping requires placeId');
  }
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) {
    throw new Error('upsertAbsentPlacePageMapping requires host');
  }
  if (!url) {
    throw new Error('upsertAbsentPlacePageMapping requires url');
  }

  const existing = db.prepare(`
    SELECT status, evidence
      FROM place_page_mappings
     WHERE place_id = ?
       AND host = ?
       AND page_kind = ?
     LIMIT 1
  `).get(placeId, normalizedHost, pageKind);

  if (existing) {
    const existingEvidence = parseEvidence(existing.evidence);
    const presence = typeof existingEvidence?.presence === 'string' ? existingEvidence.presence : null;
    if (existing.status === 'verified' && presence !== 'absent') {
      return { skipped: true, reason: 'verified-present' };
    }
  }

  const resolvedEvidence = evidence && typeof evidence === 'object'
    ? evidence
    : { presence: 'absent' };

  return upsertPlacePageMapping(db, {
    placeId,
    host: normalizedHost,
    url,
    pageKind,
    status: 'verified',
    evidence: resolvedEvidence,
    verifiedAt,
    timestamp
  });
}

function markPlacePageMappingVerified(db, {
  placeId,
  host,
  pageKind = DEFAULT_PAGE_KIND,
  hubId = null,
  url = null,
  verifiedAt = new Date().toISOString()
}) {
  const normalizedHost = normalizeHost(host);
  if (!placeId || !normalizedHost) {
    throw new Error('markPlacePageMappingVerified requires placeId and host');
  }

  const stmt = db.prepare(`
    UPDATE place_page_mappings
       SET status = 'verified',
           verified_at = COALESCE(@verifiedAt, verified_at),
           last_seen_at = COALESCE(@verifiedAt, last_seen_at),
           hub_id = COALESCE(@hubId, hub_id),
           url = COALESCE(@url, url)
     WHERE place_id = @placeId
       AND host = @host
       AND page_kind = @pageKind
  `);

  return stmt.run({
    placeId,
    host: normalizedHost,
    pageKind,
    hubId,
    url,
    verifiedAt
  });
}

function getCountryHubCoverage(db, host, { pageKind = DEFAULT_PAGE_KIND } = {}) {
  const normalizedHost = normalizeHost(host);
  const rows = db.prepare(`
    WITH countries AS (
      SELECT
        p.id,
        p.country_code AS code,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names
             WHERE place_id = p.id
             ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
             LIMIT 1)
        ) AS name,
        COALESCE(p.priority_score, p.population, 0) AS importance,
        COALESCE(p.population, 0) AS population
      FROM places p
      WHERE p.kind = 'country'
        AND p.country_code IS NOT NULL
        AND COALESCE(p.status, 'current') = 'current'
    ),
    mappings AS (
      SELECT
        place_id,
        host,
        url,
        status,
        verified_at,
        hub_id,
        evidence,
        last_seen_at
      FROM place_page_mappings
      WHERE host = @host
        AND page_kind = @pageKind
    )
    SELECT
      c.id AS placeId,
      c.name,
      c.code,
      c.importance,
      c.population,
      m.url,
      m.status,
      m.verified_at AS verifiedAt
    FROM countries c
    LEFT JOIN mappings m ON m.place_id = c.id
    ORDER BY c.importance DESC, c.name ASC
  `).all({ host: normalizedHost, pageKind });

  const seeded = rows.filter((row) => row.status != null).length;
  const visited = rows.filter((row) => row.status === 'verified').length;

  const missingCountries = rows
    .filter((row) => row.status === null || row.status !== 'verified')
    .map((row) => ({
      placeId: row.placeId,
      name: row.name,
      code: row.code,
      importance: row.importance,
      status: row.status ?? 'unmapped',
      url: row.url || null,
      population: row.population
    }));

  return {
    host: normalizedHost,
    pageKind,
    totalCountries: rows.length,
    seeded,
    visited,
    missing: missingCountries.length,
    missingCountries
  };
}

/**
 * Get place-place hub coverage for hierarchical relationships
 * @param {import('better-sqlite3').Database} db
 * @param {string} host - Domain/host to analyze
 * @param {Object} options - Query options
 * @returns {Object} Coverage analysis for place-place hubs
 */
function getPlacePlaceHubCoverage(db, host, { pageKind = 'place-place-hub' } = {}) {
  const normalizedHost = normalizeHost(host);

  try {
    // Get all hierarchical relationships
    const hierarchies = db.prepare(`
      WITH direct_parent AS (
        SELECT child_id, MIN(parent_id) AS parent_id
          FROM place_hierarchy
         WHERE depth IS NULL OR depth = 1
         GROUP BY child_id
      ),
      parent_places AS (
        SELECT
          p.id,
          p.kind,
          p.country_code,
          COALESCE(p.population, 0) AS population,
          COALESCE(p.priority_score, p.population, 0) AS importance,
          COALESCE(
            (SELECT name FROM place_names WHERE id = p.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = p.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name
        FROM places p
        WHERE COALESCE(p.status, 'current') = 'current'
      ),
      child_places AS (
        SELECT
          p.id,
          p.kind,
          p.country_code,
          COALESCE(p.population, 0) AS population,
          COALESCE(p.priority_score, p.population, 0) AS importance,
          COALESCE(
            (SELECT name FROM place_names WHERE id = p.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = p.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name
        FROM places p
        WHERE COALESCE(p.status, 'current') = 'current'
      ),
      hierarchies AS (
        SELECT
          pp.id AS parent_id,
          pp.name AS parent_name,
          pp.kind AS parent_kind,
          pp.country_code AS parent_country_code,
          pp.population AS parent_population,
          pp.importance AS parent_importance,
          cp.id AS child_id,
          cp.name AS child_name,
          cp.kind AS child_kind,
          cp.country_code AS child_country_code,
          cp.population AS child_population,
          cp.importance AS child_importance
        FROM direct_parent dp
        JOIN parent_places pp ON pp.id = dp.parent_id
        JOIN child_places cp ON cp.id = dp.child_id
        WHERE pp.name IS NOT NULL AND cp.name IS NOT NULL
      ),
      mappings AS (
        SELECT
          place_id,
          host,
          url,
          status,
          verified_at,
          hub_id,
          evidence,
          last_seen_at
        FROM place_page_mappings
        WHERE host = @host
          AND page_kind = @pageKind
      )
      SELECT
        h.parent_id,
        h.parent_name,
        h.parent_kind,
        h.parent_country_code,
        h.parent_population,
        h.parent_importance,
        h.child_id,
        h.child_name,
        h.child_kind,
        h.child_country_code,
        h.child_population,
        h.child_importance,
        m.url,
        m.status,
        m.verified_at AS verifiedAt
      FROM hierarchies h
      LEFT JOIN mappings m ON m.place_id = h.child_id
      ORDER BY (h.parent_population + h.child_population) DESC
    `).all({ host: normalizedHost, pageKind });

    const seeded = hierarchies.filter((row) => row.status != null).length;
    const visited = hierarchies.filter((row) => row.status === 'verified').length;

    const missingHierarchies = hierarchies
      .filter((row) => row.status === null || row.status !== 'verified')
      .map((row) => ({
        parent: {
          id: row.parent_id,
          name: row.parent_name,
          kind: row.parent_kind,
          country_code: row.parent_country_code,
          population: row.parent_population,
          importance: row.parent_importance
        },
        child: {
          id: row.child_id,
          name: row.child_name,
          kind: row.child_kind,
          country_code: row.child_country_code,
          population: row.child_population,
          importance: row.child_importance
        },
        status: row.status ?? 'unmapped',
        url: row.url || null
      }));

    return {
      host: normalizedHost,
      pageKind,
      totalHierarchies: hierarchies.length,
      seeded,
      visited,
      missing: missingHierarchies.length,
      missingHierarchies
    };
  } catch (err) {
    console.error('[placePageMappings] Error fetching place-place hub coverage:', err.message);
    return {
      host: normalizedHost,
      pageKind,
      totalHierarchies: 0,
      seeded: 0,
      visited: 0,
      missing: 0,
      missingHierarchies: []
    };
  }
}

/**
 * Get verified hubs ready for archive crawling
 * @param {import('better-sqlite3').Database} db
 * @param {Object} options - Query options
 * @param {string} [options.host] - Filter by host (optional)
 * @param {string} [options.pageKind] - Filter by page kind (default: 'country-hub')
 * @param {number} [options.limit] - Max hubs to return (default: 100)
 * @param {string} [options.orderBy] - 'priority' | 'oldest_check' | 'depth' (default: 'priority')
 * @param {boolean} [options.needsDepthCheck] - Only return hubs needing depth check
 * @param {number} [options.depthCheckMaxAgeHours] - Max age of depth check in hours (default: 168 = 7 days)
 * @returns {Array<Object>} Array of verified hub mappings with place info
 */
function getVerifiedHubsForArchive(db, {
  host = null,
  pageKind = DEFAULT_PAGE_KIND,
  limit = 100,
  orderBy = 'priority',
  needsDepthCheck = false,
  depthCheckMaxAgeHours = 168
} = {}) {
  const maxAgeClause = needsDepthCheck
    ? `AND (
         pm.last_depth_check_at IS NULL
         OR datetime(pm.last_depth_check_at) < datetime('now', '-${depthCheckMaxAgeHours} hours')
       )`
    : '';

  const hostClause = host ? 'AND pm.host = @host' : '';

  const orderClauses = {
    priority: 'COALESCE(p.priority_score, p.population, 0) DESC',
    oldest_check: 'COALESCE(pm.last_depth_check_at, "1970-01-01") ASC',
    depth: 'COALESCE(pm.max_page_depth, 0) DESC'
  };
  const orderClause = orderClauses[orderBy] || orderClauses.priority;

  const stmt = db.prepare(`
    SELECT
      pm.id,
      pm.place_id AS placeId,
      pm.host,
      pm.url,
      pm.page_kind AS pageKind,
      pm.status,
      pm.verified_at AS verifiedAt,
      pm.hub_id AS hubId,
      pm.max_page_depth AS maxPageDepth,
      pm.oldest_content_date AS oldestContentDate,
      pm.last_depth_check_at AS lastDepthCheckAt,
      pm.depth_check_error AS depthCheckError,
      pm.evidence,
      p.kind AS placeKind,
      p.country_code AS countryCode,
      p.population,
      p.priority_score AS priorityScore,
      COALESCE(
        (SELECT name FROM place_names WHERE id = p.canonical_name_id),
        (SELECT name FROM place_names
           WHERE place_id = p.id
           ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
           LIMIT 1)
      ) AS placeName
    FROM place_page_mappings pm
    JOIN places p ON p.id = pm.place_id
    WHERE pm.status = 'verified'
      AND pm.page_kind = @pageKind
      AND json_extract(pm.evidence, '$.presence') IS NOT 'absent'
      ${hostClause}
      ${maxAgeClause}
    ORDER BY ${orderClause}
    LIMIT @limit
  `);

  return stmt.all({
    host: host ? normalizeHost(host) : null,
    pageKind,
    limit
  });
}

/**
 * Update hub depth check results
 * @param {import('better-sqlite3').Database} db
 * @param {Object} params
 * @param {number} params.id - Place page mapping ID
 * @param {number} params.maxPageDepth - Maximum page depth found
 * @param {string} params.oldestContentDate - ISO date of oldest content
 * @param {string} [params.error] - Error message if check failed
 */
function updateHubDepthCheck(db, {
  id,
  maxPageDepth,
  oldestContentDate,
  error = null
}) {
  const stmt = db.prepare(`
    UPDATE place_page_mappings
    SET max_page_depth = @maxPageDepth,
        oldest_content_date = @oldestContentDate,
        last_depth_check_at = datetime('now'),
        depth_check_error = @error
    WHERE id = @id
  `);

  return stmt.run({
    id,
    maxPageDepth,
    oldestContentDate,
    error
  });
}

/**
 * Get archive crawl statistics for a host
 * @param {import('better-sqlite3').Database} db
 * @param {string} host - Domain host
 * @returns {Object} Statistics about archive coverage
 */
function getArchiveCrawlStats(db, host) {
  const normalizedHost = normalizeHost(host);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS totalMappings,
      SUM(CASE WHEN status = 'verified' AND json_extract(evidence, '$.presence') IS NOT 'absent' THEN 1 ELSE 0 END) AS verifiedPresent,
      SUM(CASE WHEN status = 'verified' AND json_extract(evidence, '$.presence') = 'absent' THEN 1 ELSE 0 END) AS verifiedAbsent,
      SUM(CASE WHEN max_page_depth IS NOT NULL THEN 1 ELSE 0 END) AS depthChecked,
      SUM(CASE WHEN max_page_depth > 1 THEN 1 ELSE 0 END) AS hasMultiplePages,
      AVG(CASE WHEN max_page_depth IS NOT NULL THEN max_page_depth END) AS avgPageDepth,
      MAX(max_page_depth) AS maxPageDepth,
      MIN(oldest_content_date) AS oldestContent,
      SUM(CASE WHEN depth_check_error IS NOT NULL THEN 1 ELSE 0 END) AS depthCheckErrors
    FROM place_page_mappings
    WHERE host = @host
  `).get({ host: normalizedHost });

  return {
    host: normalizedHost,
    ...stats
  };
}

/**
 * Get hubs that need archiving (verified, with depth, not yet fully crawled)
 * @param {import('better-sqlite3').Database} db
 * @param {Object} options
 * @param {string} [options.host] - Filter by host
 * @param {number} [options.minDepth] - Minimum page depth to include (default: 2)
 * @param {number} [options.limit] - Max results (default: 50)
 * @returns {Array<Object>} Hubs ready for archive crawling
 */
function getHubsNeedingArchive(db, {
  host = null,
  minDepth = 2,
  limit = 50
} = {}) {
  const hostClause = host ? 'AND pm.host = @host' : '';

  const stmt = db.prepare(`
    SELECT
      pm.id,
      pm.place_id AS placeId,
      pm.host,
      pm.url,
      pm.page_kind AS pageKind,
      pm.max_page_depth AS maxPageDepth,
      pm.oldest_content_date AS oldestContentDate,
      pm.last_depth_check_at AS lastDepthCheckAt,
      p.kind AS placeKind,
      p.country_code AS countryCode,
      p.population,
      COALESCE(
        (SELECT name FROM place_names WHERE id = p.canonical_name_id),
        (SELECT name FROM place_names
           WHERE place_id = p.id
           ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
           LIMIT 1)
      ) AS placeName,
      -- Estimate archive priority based on depth and population
      (pm.max_page_depth * LOG(COALESCE(p.population, 1000) + 1)) AS archivePriority
    FROM place_page_mappings pm
    JOIN places p ON p.id = pm.place_id
    WHERE pm.status = 'verified'
      AND pm.max_page_depth >= @minDepth
      AND json_extract(pm.evidence, '$.presence') IS NOT 'absent'
      ${hostClause}
    ORDER BY archivePriority DESC
    LIMIT @limit
  `);

  return stmt.all({
    host: host ? normalizeHost(host) : null,
    minDepth,
    limit
  });
}

module.exports = {
  getCountryHubCoverage,
  getPlacePlaceHubCoverage,
  markPlacePageMappingVerified,
  upsertPlacePageMapping,
  upsertAbsentPlacePageMapping,
  getVerifiedHubsForArchive,
  updateHubDepthCheck,
  getArchiveCrawlStats,
  getHubsNeedingArchive
};
