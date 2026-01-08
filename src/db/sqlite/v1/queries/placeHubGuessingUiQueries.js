'use strict';

const { slugify } = require('../../../../tools/slugify');

function clampInt(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normalizePlaceKind(kind) {
  const value = String(kind || '').trim().toLowerCase();
  if (!value) return 'country';
  return value;
}

function normalizePageKind(kind) {
  const value = String(kind || '').trim().toLowerCase();
  if (!value) return 'country-hub';
  return value;
}

function normalizeSearchQuery(value) {
  const s = String(value || '').trim();
  return s.length ? s : '';
}

/**
 * Normalize a host by stripping www. prefix.
 * This ensures theguardian.com and www.theguardian.com are treated as the same publisher.
 */
function normalizeHost(host) {
  if (!host) return '';
  const h = String(host).toLowerCase().trim();
  return h.startsWith('www.') ? h.slice(4) : h;
}

function parseEvidenceJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function normalizeOutcome(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'present' || v === 'there' || v === 'yes') return 'present';
  if (v === 'absent' || v === 'not-there' || v === 'no') return 'absent';
  return null;
}

function getMappingOutcome(mapping) {
  const evidence = parseEvidenceJson(mapping?.evidence);
  const presence = typeof evidence?.presence === 'string' ? evidence.presence : null;
  if (presence === 'present' || presence === 'absent') return presence;

  // Backward-compatible heuristic: any verified mapping without evidence means "present".
  if (!mapping) return null;
  const isVerified = mapping.status === 'verified' || !!mapping.verified_at;
  if (isVerified) return 'present';
  return null;
}

function computeAgeLabel(isoString) {
  if (!isoString) return '';
  const ts = new Date(isoString).getTime();
  if (!Number.isFinite(ts)) return '';
  const deltaMs = Date.now() - ts;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return '';
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function selectPlaces(dbHandle, { placeKind, placeLimit, orderBy = 'name' }) {
  // Order by population for cities/regions to show "major" places first
  // Order alphabetically for countries (there are only ~250, so seeing all makes sense)
  // Use "population DESC NULLS LAST" to allow index usage (COALESCE prevents it)
  const orderClause = (placeKind === 'city' || placeKind === 'region') && orderBy !== 'name'
    ? 'p.population DESC NULLS LAST, place_name ASC'
    : 'place_name ASC';

  const sql = `
    SELECT
      p.id AS place_id,
      p.kind AS place_kind,
      p.country_code,
      p.population,
      COALESCE(
        pn.name,
        (
          SELECT pn2.name
          FROM place_names pn2
          WHERE pn2.place_id = p.id
          ORDER BY COALESCE(pn2.is_preferred, 0) DESC, COALESCE(pn2.is_official, 0) DESC, pn2.id ASC
          LIMIT 1
        ),
        p.country_code,
        CAST(p.id AS TEXT)
      ) AS place_name
    FROM places p
    LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
    WHERE p.kind = ?
      AND COALESCE(p.status, 'current') = 'current'
    ORDER BY ${orderClause}
    LIMIT ?
  `;

  return dbHandle.prepare(sql).all(placeKind, placeLimit);
}

/**
 * Get countries grouped by continent (region from extra JSON field).
 * Used for continent-based hub discovery views.
 * @param {object} dbHandle - Database connection
 * @param {object} options - Options
 * @param {string} options.continent - Filter by continent name (e.g., "Europe", "Africa", "Asia", "Americas", "Oceania")
 * @param {number} options.limit - Max countries to return (default: 200)
 * @returns {Array} Countries with continent info
 */
function selectCountriesByContinent(dbHandle, { continent, limit = 200 }) {
  const sql = `
    SELECT
      p.id AS place_id,
      p.kind AS place_kind,
      p.country_code,
      p.population,
      json_extract(p.extra, '$.region') AS continent,
      json_extract(p.extra, '$.subregion') AS subregion,
      COALESCE(
        pn.name,
        (
          SELECT pn2.name
          FROM place_names pn2
          WHERE pn2.place_id = p.id
          ORDER BY COALESCE(pn2.is_preferred, 0) DESC, COALESCE(pn2.is_official, 0) DESC, pn2.id ASC
          LIMIT 1
        ),
        p.country_code,
        CAST(p.id AS TEXT)
      ) AS place_name
    FROM places p
    LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
    WHERE p.kind = 'country'
      AND COALESCE(p.status, 'current') = 'current'
      AND (? IS NULL OR json_extract(p.extra, '$.region') = ?)
    ORDER BY continent, place_name ASC
    LIMIT ?
  `;

  const continentParam = continent && continent.toLowerCase() !== 'all' ? continent : null;
  return dbHandle.prepare(sql).all(continentParam, continentParam, limit);
}

/**
 * Get list of all continents (regions) in the database.
 * @param {object} dbHandle - Database connection
 * @returns {Array} Continent names with counts
 */
function listContinents(dbHandle) {
  const sql = `
    SELECT
      json_extract(extra, '$.region') AS continent,
      COUNT(*) AS country_count
    FROM places
    WHERE kind = 'country'
      AND COALESCE(status, 'current') = 'current'
      AND json_extract(extra, '$.region') IS NOT NULL
    GROUP BY json_extract(extra, '$.region')
    ORDER BY continent ASC
  `;

  return dbHandle.prepare(sql).all();
}

/**
 * Select hosts for the matrix, combining:
 * 1. Hosts that already have place_page_mappings (prioritized)
 * 2. Major news domains from domains table (fill remaining slots)
 * 
 * Excludes non-news hosts like wikipedia, archive.org, etc.
 */
function selectHosts(dbHandle, { pageKind, hostLimit }) {
  // Hosts to exclude (not news sources)
  const excludeHosts = new Set([
    'en.wikipedia.org',
    'wikipedia.org',
    'archive.org',
    'web.archive.org',
    'twitter.com',
    'x.com',
    'facebook.com',
    'youtube.com',
    'instagram.com',
    'linkedin.com',
    'example.com',
    'city', // data artifact
    'interactive.aljazeera.com' // subdomain of main site
  ]);

  // First: hosts with existing mappings (highest priority)
  // Normalize hosts by stripping www. prefix to deduplicate theguardian.com / www.theguardian.com
  const rawHosts = dbHandle
    .prepare(
      `
      SELECT host, COUNT(*) AS cnt
      FROM place_page_mappings
      WHERE page_kind = ?
      GROUP BY host
      ORDER BY cnt DESC, host ASC
      LIMIT ?
    `
    )
    .all(pageKind, hostLimit * 2); // Fetch more since we'll dedupe

  // Normalize and deduplicate: prefer higher count version
  const hostCountMap = new Map();
  for (const r of rawHosts) {
    if (!r.host || excludeHosts.has(r.host)) continue;
    const normalized = normalizeHost(r.host);
    if (excludeHosts.has(normalized)) continue;
    const existing = hostCountMap.get(normalized);
    if (!existing || r.cnt > existing.cnt) {
      hostCountMap.set(normalized, { host: normalized, cnt: r.cnt, original: r.host });
    }
  }
  
  const withMappings = Array.from(hostCountMap.values())
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, hostLimit)
    .map(h => h.host);

  // If we already have enough hosts, return them
  if (withMappings.length >= hostLimit) {
    return withMappings.slice(0, hostLimit);
  }

  // Second: fill remaining slots from domains table (major news sources)
  const remaining = hostLimit - withMappings.length;
  const existingSet = new Set(withMappings);
  // Normalize and filter from domains too
  const fromDomainsRaw = dbHandle
    .prepare(
      `
      SELECT d.host, COUNT(u.id) AS url_count
      FROM domains d
      LEFT JOIN urls u ON u.host = d.host
      WHERE d.host IS NOT NULL 
        AND d.host != ''
        AND d.host NOT LIKE '%wikipedia%'
        AND d.host NOT LIKE '%archive%'
        AND d.host NOT LIKE '%twitter%'
        AND d.host NOT LIKE '%facebook%'
        AND d.host NOT LIKE '%youtube%'
      GROUP BY d.host
      ORDER BY url_count DESC, COALESCE(d.last_seen_at, d.created_at) DESC
      LIMIT ?
    `
    )
    .all(remaining + 40); // fetch extra to filter and dedupe
  
  const fromDomains = [];
  for (const r of fromDomainsRaw) {
    const normalized = normalizeHost(r.host);
    if (normalized && !excludeHosts.has(normalized) && !existingSet.has(normalized)) {
      existingSet.add(normalized); // prevent duplicates
      fromDomains.push(normalized);
      if (fromDomains.length >= remaining) break;
    }
  }

  return [...withMappings, ...fromDomains];
}

function selectMappings(dbHandle, { pageKind, placeIds, hosts }) {
  if (placeIds.length === 0 || hosts.length === 0) return [];

  // Expand hosts to include both normalized and www. variants
  const expandedHosts = new Set();
  for (const h of hosts) {
    expandedHosts.add(h);
    expandedHosts.add('www.' + h);
  }
  const hostArray = Array.from(expandedHosts);
  
  // Expand page_kind to include equivalent variations
  // 'country-hub' should also match 'country', 'city-hub' should match 'city', etc.
  const expandedPageKinds = new Set([pageKind]);
  if (pageKind === 'country-hub') expandedPageKinds.add('country');
  if (pageKind === 'country') expandedPageKinds.add('country-hub');
  if (pageKind === 'city-hub') expandedPageKinds.add('city');
  if (pageKind === 'city') expandedPageKinds.add('city-hub');
  if (pageKind === 'region-hub') expandedPageKinds.add('region');
  if (pageKind === 'region') expandedPageKinds.add('region-hub');
  const pageKindArray = Array.from(expandedPageKinds);

  const placePlaceholders = placeIds.map(() => '?').join(',');
  const hostPlaceholders = hostArray.map(() => '?').join(',');
  const pageKindPlaceholders = pageKindArray.map(() => '?').join(',');

  const sql = `
    SELECT
      place_id,
      host,
      page_kind,
      url,
      status,
      last_seen_at,
      verified_at,
      evidence,
      hub_id,
      max_page_depth,
      oldest_content_date,
      last_depth_check_at,
      depth_check_error
    FROM place_page_mappings
    WHERE page_kind IN (${pageKindPlaceholders})
      AND place_id IN (${placePlaceholders})
      AND host IN (${hostPlaceholders})
  `;

  const rows = dbHandle.prepare(sql).all(...pageKindArray, ...placeIds, ...hostArray);
  
  // Normalize host in results and pick best mapping per place+host combo
  // Priority: verified > pending > candidate, present > absent
  const bestByKey = new Map();
  for (const row of rows) {
    const normalizedHost = normalizeHost(row.host);
    const key = `${row.place_id}|${normalizedHost}`;
    const existing = bestByKey.get(key);
    
    if (!existing) {
      bestByKey.set(key, { ...row, host: normalizedHost });
    } else {
      // Pick the better mapping
      const isNewVerified = row.status === 'verified' || !!row.verified_at;
      const isExistingVerified = existing.status === 'verified' || !!existing.verified_at;
      
      if (isNewVerified && !isExistingVerified) {
        bestByKey.set(key, { ...row, host: normalizedHost });
      } else if (isNewVerified && isExistingVerified) {
        // Both verified - prefer present over absent
        const newOutcome = getMappingOutcome(row);
        const existingOutcome = getMappingOutcome(existing);
        if (newOutcome === 'present' && existingOutcome !== 'present') {
          bestByKey.set(key, { ...row, host: normalizedHost });
        }
      }
    }
  }
  
  return Array.from(bestByKey.values());
}

function selectCandidates(dbHandle, { placeSlugs, hosts }) {
  if (placeSlugs.length === 0 || hosts.length === 0) return [];
  const placePlaceholders = placeSlugs.map(() => '?').join(',');
  const hostPlaceholders = hosts.map(() => '?').join(',');

  const sql = `
    SELECT
      place_slug,
      host,
      url,
      title,
      first_seen_at,
      last_seen_at,
      evidence
    FROM place_hubs_with_urls
    WHERE place_slug IN (${placePlaceholders})
      AND host IN (${hostPlaceholders})
  `;
  return dbHandle.prepare(sql).all(...placeSlugs, ...hosts);
}

function buildMatrixModel(dbHandle, options = {}) {
  if (!dbHandle) throw new Error('buildMatrixModel requires dbHandle');

  const placeKind = normalizePlaceKind(options.placeKind);
  const pageKind = normalizePageKind(options.pageKind);
  const continent = options.continent || null;
  
  // Dynamic limits based on place kind:
  // - Countries: show all (there are only ~250)
  // - Regions/Cities: use configurable limits
  const defaultPlaceLimit = placeKind === 'country' ? 300 : 200;
  const maxPlaceLimit = placeKind === 'country' ? 500 : 500;
  
  const placeLimit = clampInt(options.placeLimit, { min: 1, max: maxPlaceLimit, fallback: defaultPlaceLimit });
  const hostLimit = clampInt(options.hostLimit, { min: 1, max: 100, fallback: 30 });
  const placeQ = normalizeSearchQuery(options.placeQ);
  const hostQ = normalizeSearchQuery(options.hostQ);
  const state = normalizeSearchQuery(options.state);
  
  // For cities/regions, order by population by default to show "major" places
  const orderBy = (placeKind === 'city' || placeKind === 'region') ? 'population' : 'name';

  // Use continent filter if specified for country kind
  let places;
  if (placeKind === 'country' && continent) {
    places = selectCountriesByContinent(dbHandle, { continent, limit: placeLimit });
  } else {
    places = selectPlaces(dbHandle, { placeKind, placeLimit, orderBy });
  }
  const hosts = selectHosts(dbHandle, { pageKind, hostLimit });

  const filteredPlaces = placeQ
    ? places.filter((p) => String(p.place_name || '').toLowerCase().includes(placeQ.toLowerCase()))
    : places;

  const filteredHosts = hostQ
    ? hosts.filter((h) => String(h || '').toLowerCase().includes(hostQ.toLowerCase()))
    : hosts;

  const placeIds = filteredPlaces.map(p => p.place_id);
  const mappings = selectMappings(dbHandle, { pageKind, placeIds, hosts: filteredHosts });

  const mappingByKey = new Map();
  for (const row of mappings) {
    mappingByKey.set(`${row.place_id}|${row.host}`, row);
  }

  // Merge candidates from place_hubs (active probe results)
  const slugToPlaceIds = new Map();
  for (const p of filteredPlaces) {
    const s = slugify(p.place_name);
    if (!slugToPlaceIds.has(s)) slugToPlaceIds.set(s, []);
    slugToPlaceIds.get(s).push(p.place_id);
  }

  const placeSlugs = Array.from(slugToPlaceIds.keys());
  if (placeSlugs.length > 0 && filteredHosts.length > 0) {
    try {
      const candidates = selectCandidates(dbHandle, { placeSlugs, hosts: filteredHosts });
      for (const cand of candidates) {
        const ids = slugToPlaceIds.get(cand.place_slug);
        if (!ids) continue;
        for (const pid of ids) {
          const key = `${pid}|${cand.host}`;
          if (!mappingByKey.has(key)) {
            mappingByKey.set(key, {
              place_id: pid,
              host: cand.host,
              place_slug: cand.place_slug,
              url: cand.url, 
              status: 'candidate', 
              first_seen_at: cand.first_seen_at,
              last_seen_at: cand.last_seen_at,
              evidence: cand.evidence
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to select candidates:', err);
    }
  }

  let verifiedCount = 0;
  let pendingCount = 0;
  let guessedCount = 0;
  let verifiedPresentCount = 0;
  let verifiedAbsentCount = 0;
  let deepHubCount = 0;
  let depthCheckedCount = 0;

  for (const row of mappingByKey.values()) {
    const isVerified = row.status === 'verified' || !!row.verified_at;
    const maxDepth = row.max_page_depth || row.maxPageDepth || 0;

    if (maxDepth > 0) {
      depthCheckedCount += 1;
    }

    if (isVerified) {
      verifiedCount += 1;
      const outcome = getMappingOutcome(row);
      if (outcome === 'absent') {
        verifiedAbsentCount += 1;
      } else {
        verifiedPresentCount += 1;
        // Count as deep hub if verified present with 10+ pages
        if (maxDepth >= 10) {
          deepHubCount += 1;
        }
      }
    } else if (row.status === 'candidate') {
      guessedCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const uncheckedCount = (filteredPlaces.length * filteredHosts.length) - (verifiedCount + pendingCount + guessedCount);

  return {
    placeKind,
    pageKind,
    placeLimit,
    hostLimit,
    placeQ,
    hostQ,
    state,
    stateFilter: options.stateFilter || 'all',
    places: filteredPlaces,
    hosts: filteredHosts,
    mappingByKey,
    stats: {
      verifiedCount,
      pendingCount,
      guessedCount,
      uncheckedCount,
      verifiedPresentCount,
      verifiedAbsentCount,
      deepHubCount,
      depthCheckedCount
    }
  };
}

function selectPlaceById(dbHandle, placeId) {
  const sql = `
    SELECT
      p.id AS place_id,
      p.kind AS place_kind,
      p.country_code,
      COALESCE(
        pn.name,
        (
          SELECT pn2.name
          FROM place_names pn2
          WHERE pn2.place_id = p.id
          ORDER BY COALESCE(pn2.is_preferred, 0) DESC, COALESCE(pn2.is_official, 0) DESC, pn2.id ASC
          LIMIT 1
        ),
        p.country_code,
        CAST(p.id AS TEXT)
      ) AS place_name
    FROM places p
    LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
    WHERE p.id = ?
    LIMIT 1
  `;

  return dbHandle.prepare(sql).get(placeId);
}

function selectMappingByPlaceHost(dbHandle, { pageKind, placeId, host }) {
  const sql = `
    SELECT
      place_id,
      host,
      url,
      status,
      last_seen_at,
      verified_at,
      evidence,
      hub_id
    FROM place_page_mappings
    WHERE page_kind = ?
      AND place_id = ?
      AND host = ?
    LIMIT 1
  `;

  return dbHandle.prepare(sql).get(pageKind, placeId, host);
}

function selectCandidateByPlaceHost(dbHandle, { placeSlugs, host }) {
  if (placeSlugs.length === 0) return null;
  const placeholders = placeSlugs.map(() => '?').join(',');
  const sql = `
    SELECT
      place_slug,
      host,
      url,
      title,
      first_seen_at,
      last_seen_at,
      evidence
    FROM place_hubs_with_urls
    WHERE place_slug IN (${placeholders})
      AND host = ?
    LIMIT 1
  `;
  return dbHandle.prepare(sql).get(...placeSlugs, host);
}

function getCellModel(dbHandle, options = {}) {
  if (!dbHandle) throw new Error('getCellModel requires dbHandle');

  const placeId = Number(options.placeId);
  const host = String(options.host || '').trim();
  const placeKind = normalizePlaceKind(options.placeKind);
  const pageKind = normalizePageKind(options.pageKind);
  const placeLimit = clampInt(options.placeLimit, { min: 1, max: 500, fallback: 200 });
  const hostLimit = clampInt(options.hostLimit, { min: 1, max: 100, fallback: 30 });
  const placeQ = normalizeSearchQuery(options.placeQ);
  const hostQ = normalizeSearchQuery(options.hostQ);
  const stateFilter = normalizeSearchQuery(options.stateFilter);
  const continent = normalizeSearchQuery(options.continent);
  const parentPlace = normalizeSearchQuery(options.parentPlace);
  const activePattern = normalizeSearchQuery(options.activePattern);
  const matrixMode = normalizeSearchQuery(options.matrixMode);
  const matrixThreshold = Number.isFinite(Number(options.matrixThreshold)) ? Number(options.matrixThreshold) : undefined;

  if (!Number.isFinite(placeId) || placeId <= 0) {
    return { error: { status: 400, message: 'Invalid placeId' } };
  }
  if (!host) {
    return { error: { status: 400, message: 'Invalid host' } };
  }

  const place = selectPlaceById(dbHandle, placeId);
  if (!place) {
    return { error: { status: 404, message: 'Place not found' } };
  }

  let mapping = selectMappingByPlaceHost(dbHandle, { pageKind, placeId, host });

  // If no verified mapping, check for candidate
  if (!mapping) {
    const s = slugify(place.place_name);
    const candidate = selectCandidateByPlaceHost(dbHandle, { placeSlugs: [s], host });
    if (candidate) {
      mapping = {
        place_id: placeId,
        host,
        place_slug: candidate.place_slug,
        url: candidate.url,
        status: 'candidate',
        first_seen_at: candidate.first_seen_at,
        last_seen_at: candidate.last_seen_at,
        evidence: candidate.evidence
      };
    }
  }

  return {
    modelContext: {
      placeKind,
      pageKind,
      placeLimit,
      hostLimit,
      placeQ,
      hostQ,
      stateFilter,
      continent,
      parentPlace,
      activePattern,
      matrixMode,
      matrixThreshold
    },
    place,
    host,
    mapping
  };
}

function upsertCellVerification(dbHandle, options = {}) {
  if (!dbHandle) throw new Error('upsertCellVerification requires dbHandle');

  const placeId = Number(options.placeId);
  const host = String(options.host || '').trim();
  const pageKind = normalizePageKind(options.pageKind);
  const outcome = normalizeOutcome(options.outcome);
  const url = String(options.url || '').trim();
  const note = String(options.note || '').trim();

  if (!Number.isFinite(placeId) || placeId <= 0) {
    return { error: { status: 400, message: 'Invalid placeId' } };
  }
  if (!host) {
    return { error: { status: 400, message: 'Invalid host' } };
  }
  if (!outcome) {
    return { error: { status: 400, message: 'Invalid outcome' } };
  }

  const nowIso = new Date().toISOString();
  const evidence = {
    presence: outcome,
    checked_url: url || null,
    note: note || null,
    source: 'placeHubGuessing.ui',
    verified_at: nowIso
  };

  const sql = `
    INSERT INTO place_page_mappings (
      place_id,
      host,
      page_kind,
      url,
      status,
      verified_at,
      evidence
    ) VALUES (?, ?, ?, ?, 'verified', ?, ?)
    ON CONFLICT(place_id, host, page_kind)
    DO UPDATE SET
      url = excluded.url,
      status = 'verified',
      verified_at = excluded.verified_at,
      evidence = excluded.evidence
  `;

  dbHandle.prepare(sql).run(placeId, host, pageKind, url || null, nowIso, JSON.stringify(evidence));

  return {
    ok: true,
    evidence,
    placeId,
    host,
    pageKind
  };
}

/**
 * Extract the path pattern from a hub URL.
 * e.g., "https://www.theguardian.com/world/africa" → "/world/africa"
 * @param {string} hubUrl 
 * @returns {string|null}
 */
function extractPathPattern(hubUrl) {
  if (!hubUrl) return null;
  try {
    const url = new URL(hubUrl);
    // Return path without trailing slash for consistent LIKE matching
    return url.pathname.replace(/\/$/, '') || '/';
  } catch {
    // If not a valid URL, try to extract path directly
    const match = hubUrl.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
    return match ? match[1].replace(/\/$/, '') || '/' : null;
  }
}

/**
 * Get article metrics for a hub based on URL pattern matching.
 * Queries http_responses + urls + content_analysis tables to count articles under the hub path.
 * 
 * @param {object} dbHandle - Database handle
 * @param {object} options
 * @param {string} options.host - Host domain (e.g., "theguardian.com")
 * @param {string} options.urlPattern - Path pattern (e.g., "/world/africa")
 * @returns {object|null} { article_count, earliest_article, latest_article, days_span }
 */
function getHubArticleMetrics(dbHandle, { host, urlPattern }) {
  if (!dbHandle || !host || !urlPattern) return null;

  // Normalize host (remove www. prefix for matching)
  const normalizedHost = host.replace(/^www\./, '');
  const hostVariants = [normalizedHost, `www.${normalizedHost}`];
  
  const hostPlaceholders = hostVariants.map(() => '?').join(',');

  // Note: urls table has 'url' column (full URL), not 'path'.
  // We match using LIKE against the full URL with the pattern.
  // Join to content_analysis to filter for actual articles.
  const sql = `
    SELECT 
      COUNT(*) AS article_count,
      MIN(hr.fetched_at) AS earliest_article,
      MAX(hr.fetched_at) AS latest_article,
      CAST(
        CASE 
          WHEN MAX(hr.fetched_at) IS NOT NULL AND MIN(hr.fetched_at) IS NOT NULL
          THEN julianday(MAX(hr.fetched_at)) - julianday(MIN(hr.fetched_at))
          ELSE 0 
        END AS INTEGER
      ) AS days_span
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    JOIN content_analysis ca ON ca.content_id = hr.id
    WHERE u.host IN (${hostPlaceholders})
      AND u.url LIKE '%' || ? || '/%'
      AND hr.http_status = 200
      AND ca.classification = 'article'
  `;

  try {
    const result = dbHandle.prepare(sql).get(...hostVariants, urlPattern);
    return result || { article_count: 0, earliest_article: null, latest_article: null, days_span: 0 };
  } catch (err) {
    console.error('getHubArticleMetrics error:', err.message);
    return { article_count: 0, earliest_article: null, latest_article: null, days_span: 0 };
  }
}

/**
 * Get recent articles for a hub based on URL pattern matching.
 * Joins to content_analysis to get title and word_count.
 * 
 * @param {object} dbHandle - Database handle
 * @param {object} options
 * @param {string} options.host - Host domain
 * @param {string} options.urlPattern - Path pattern
 * @param {number} [options.limit=20] - Max articles to return
 * @returns {Array} Array of { url, title, fetched_at, word_count }
 */
function getRecentHubArticles(dbHandle, { host, urlPattern, limit = 20 }) {
  if (!dbHandle || !host || !urlPattern) return [];

  const normalizedHost = host.replace(/^www\./, '');
  const hostVariants = [normalizedHost, `www.${normalizedHost}`];
  const hostPlaceholders = hostVariants.map(() => '?').join(',');

  // Note: title and word_count are in content_analysis, not http_responses
  const sql = `
    SELECT 
      u.url,
      ca.title,
      hr.fetched_at,
      ca.word_count
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    JOIN content_analysis ca ON ca.content_id = hr.id
    WHERE u.host IN (${hostPlaceholders})
      AND u.url LIKE '%' || ? || '/%'
      AND hr.http_status = 200
      AND ca.classification = 'article'
    ORDER BY hr.fetched_at DESC
    LIMIT ?
  `;

  try {
    return dbHandle.prepare(sql).all(...hostVariants, urlPattern, limit);
  } catch (err) {
    console.error('getRecentHubArticles error:', err.message);
    return [];
  }
}

/**
 * Get all name variants for a place from the gazetteer database.
 * Returns names in different languages, aliases, and normalized forms.
 * 
 * @param {object} gazetteerDb - Gazetteer database handle
 * @param {number} placeId - Place ID
 * @returns {Array} Array of { name, lang, name_kind, is_preferred, is_official, normalized }
 */
function getPlaceNameVariants(gazetteerDb, placeId) {
  if (!gazetteerDb || !placeId) return [];

  const sql = `
    SELECT 
      name,
      lang,
      name_kind,
      COALESCE(is_preferred, 0) AS is_preferred,
      COALESCE(is_official, 0) AS is_official,
      normalized
    FROM place_names
    WHERE place_id = ?
    ORDER BY 
      COALESCE(is_preferred, 0) DESC,
      COALESCE(is_official, 0) DESC,
      lang ASC,
      name ASC
  `;

  try {
    return gazetteerDb.prepare(sql).all(placeId);
  } catch (err) {
    console.error('getPlaceNameVariants error:', err.message);
    return [];
  }
}

/**
 * Generate possible URL patterns for a place name on a given host.
 * Creates variations based on common URL structures used by news websites.
 * 
 * @param {string} placeName - The place name to transform
 * @param {string} host - The host domain
 * @returns {Array} Array of { pattern, description, example }
 */
function generateUrlPatterns(placeName, host) {
  if (!placeName || !host) return [];

  const patterns = [];
  const name = String(placeName).trim();
  
  // Create various URL-safe versions of the name
  const slugified = slugify(name);
  const lowercase = name.toLowerCase();
  const dashified = lowercase.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const underscored = lowercase.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  
  // Common patterns used by news sites
  patterns.push({
    pattern: `/${slugified}`,
    description: 'Slugified path segment',
    example: `https://${host}/${slugified}`
  });
  
  patterns.push({
    pattern: `/world/${slugified}`,
    description: 'World section + slug',
    example: `https://${host}/world/${slugified}`
  });
  
  patterns.push({
    pattern: `/news/${slugified}`,
    description: 'News section + slug',
    example: `https://${host}/news/${slugified}`
  });
  
  if (dashified !== slugified) {
    patterns.push({
      pattern: `/${dashified}`,
      description: 'Dashed lowercase',
      example: `https://${host}/${dashified}`
    });
  }
  
  if (underscored !== dashified) {
    patterns.push({
      pattern: `/${underscored}`,
      description: 'Underscored lowercase',
      example: `https://${host}/${underscored}`
    });
  }
  
  // Country-specific patterns
  patterns.push({
    pattern: `/topics/${slugified}`,
    description: 'Topics section',
    example: `https://${host}/topics/${slugified}`
  });
  
  patterns.push({
    pattern: `/tag/${slugified}`,
    description: 'Tag page',
    example: `https://${host}/tag/${slugified}`
  });
  
  return patterns;
}

/**
 * Get host-specific URL patterns based on analysis of existing URLs.
 * Returns patterns discovered from actual crawled URLs for this host.
 * 
 * @param {object} dbHandle - Database handle  
 * @param {string} host - Host domain
 * @returns {Array} Array of { pattern, count, example_url }
 */
function getHostUrlPatterns(dbHandle, host) {
  if (!dbHandle || !host) return [];

  const normalizedHost = host.replace(/^www\./, '');
  const hostVariants = [normalizedHost, `www.${normalizedHost}`];
  const hostPlaceholders = hostVariants.map(() => '?').join(',');

  // Find common path patterns from existing URLs
  const sql = `
    SELECT 
      SUBSTR(u.url, 1, INSTR(SUBSTR(u.url, 9), '/') + 8 + INSTR(SUBSTR(u.url, INSTR(SUBSTR(u.url, 9), '/') + 9), '/')) AS pattern_prefix,
      COUNT(*) AS count,
      MIN(u.url) AS example_url
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    WHERE u.host IN (${hostPlaceholders})
      AND hr.http_status = 200
    GROUP BY pattern_prefix
    HAVING count >= 3
    ORDER BY count DESC
    LIMIT 20
  `;

  try {
    return dbHandle.prepare(sql).all(...hostVariants);
  } catch (err) {
    console.error('getHostUrlPatterns error:', err.message);
    return [];
  }
}

/**
 * Get website analysis freshness - when was the last analysis done for this host.
 * 
 * @param {object} dbHandle - Database handle
 * @param {string} host - Host domain
 * @returns {{ lastAnalyzedAt: string|null, articleCount: number, daysAgo: number|null }}
 */
function getHostAnalysisFreshness(dbHandle, host) {
  if (!dbHandle || !host) {
    return { lastAnalyzedAt: null, articleCount: 0, daysAgo: null };
  }

  const normalizedHost = host.replace(/^www\./, '');
  const hostVariants = [normalizedHost, `www.${normalizedHost}`];
  const hostPlaceholders = hostVariants.map(() => '?').join(',');

  const sql = `
    SELECT 
      MAX(ca.analyzed_at) AS last_analyzed_at,
      COUNT(*) AS article_count
    FROM content_analysis ca
    JOIN http_responses hr ON hr.id = ca.content_id
    JOIN urls u ON u.id = hr.url_id
    WHERE u.host IN (${hostPlaceholders})
      AND ca.classification = 'article'
  `;

  try {
    const result = dbHandle.prepare(sql).get(...hostVariants);
    if (!result || !result.last_analyzed_at) {
      return { lastAnalyzedAt: null, articleCount: 0, daysAgo: null };
    }

    const lastDate = new Date(result.last_analyzed_at);
    const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      lastAnalyzedAt: result.last_analyzed_at,
      articleCount: result.article_count,
      daysAgo
    };
  } catch (err) {
    console.error('getHostAnalysisFreshness error:', err.message);
    return { lastAnalyzedAt: null, articleCount: 0, daysAgo: null };
  }
}

module.exports = {
  buildMatrixModel,
  getCellModel,
  upsertCellVerification,
  computeAgeLabel,
  getMappingOutcome,
  normalizePlaceKind,
  normalizePageKind,
  normalizeSearchQuery,
  normalizeHost,
  clampInt,
  parseEvidenceJson,
  normalizeOutcome,
  selectHosts,
  selectPlaces,
  selectCountriesByContinent,
  listContinents,
  extractPathPattern,
  getHubArticleMetrics,
  getRecentHubArticles,
  getPlaceNameVariants,
  generateUrlPatterns,
  getHostUrlPatterns,
  getHostAnalysisFreshness
};
