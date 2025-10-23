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

module.exports = {
  getCountryHubCoverage,
  markPlacePageMappingVerified,
  upsertPlacePageMapping
};
