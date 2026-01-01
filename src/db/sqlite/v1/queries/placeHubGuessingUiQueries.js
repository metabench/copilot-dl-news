'use strict';

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

function selectPlaces(dbHandle, { placeKind, placeLimit }) {
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
    WHERE p.kind = ?
      AND COALESCE(p.status, 'current') = 'current'
    ORDER BY place_name ASC
    LIMIT ?
  `;

  return dbHandle.prepare(sql).all(placeKind, placeLimit);
}

function selectHosts(dbHandle, { pageKind, hostLimit }) {
  const byCoverage = dbHandle
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
    .all(pageKind, hostLimit)
    .map(r => r.host)
    .filter(Boolean);

  if (byCoverage.length > 0) return byCoverage;

  return dbHandle
    .prepare(
      `
      SELECT host
      FROM domains
      WHERE host IS NOT NULL AND host != ''
      ORDER BY COALESCE(last_seen_at, created_at) DESC, host ASC
      LIMIT ?
    `
    )
    .all(hostLimit)
    .map(r => r.host)
    .filter(Boolean);
}

function selectMappings(dbHandle, { pageKind, placeIds, hosts }) {
  if (placeIds.length === 0 || hosts.length === 0) return [];

  const placePlaceholders = placeIds.map(() => '?').join(',');
  const hostPlaceholders = hosts.map(() => '?').join(',');

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
      AND place_id IN (${placePlaceholders})
      AND host IN (${hostPlaceholders})
  `;

  return dbHandle.prepare(sql).all(pageKind, ...placeIds, ...hosts);
}

function buildMatrixModel(dbHandle, options = {}) {
  if (!dbHandle) throw new Error('buildMatrixModel requires dbHandle');

  const placeKind = normalizePlaceKind(options.placeKind);
  const pageKind = normalizePageKind(options.pageKind);
  const placeLimit = clampInt(options.placeLimit, { min: 1, max: 200, fallback: 30 });
  const hostLimit = clampInt(options.hostLimit, { min: 1, max: 50, fallback: 12 });
  const placeQ = normalizeSearchQuery(options.placeQ);
  const hostQ = normalizeSearchQuery(options.hostQ);
  const state = normalizeSearchQuery(options.state);

  const places = selectPlaces(dbHandle, { placeKind, placeLimit });
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

  let verifiedCount = 0;
  let pendingCount = 0;
  let verifiedPresentCount = 0;
  let verifiedAbsentCount = 0;

  for (const row of mappings) {
    const isVerified = row.status === 'verified' || !!row.verified_at;
    if (isVerified) {
      verifiedCount += 1;
      const outcome = getMappingOutcome(row);
      if (outcome === 'absent') verifiedAbsentCount += 1;
      else verifiedPresentCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  const uncheckedCount = (filteredPlaces.length * filteredHosts.length) - (verifiedCount + pendingCount);

  return {
    placeKind,
    pageKind,
    placeLimit,
    hostLimit,
    placeQ,
    hostQ,
    state,
    places: filteredPlaces,
    hosts: filteredHosts,
    mappingByKey,
    stats: {
      verifiedCount,
      pendingCount,
      uncheckedCount,
      verifiedPresentCount,
      verifiedAbsentCount
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

function getCellModel(dbHandle, options = {}) {
  if (!dbHandle) throw new Error('getCellModel requires dbHandle');

  const placeId = Number(options.placeId);
  const host = String(options.host || '').trim();
  const placeKind = normalizePlaceKind(options.placeKind);
  const pageKind = normalizePageKind(options.pageKind);
  const placeLimit = clampInt(options.placeLimit, { min: 1, max: 200, fallback: 30 });
  const hostLimit = clampInt(options.hostLimit, { min: 1, max: 50, fallback: 12 });
  const placeQ = normalizeSearchQuery(options.placeQ);
  const hostQ = normalizeSearchQuery(options.hostQ);

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

  const mapping = selectMappingByPlaceHost(dbHandle, { pageKind, placeId, host });

  return {
    modelContext: {
      placeKind,
      pageKind,
      placeLimit,
      hostLimit,
      placeQ,
      hostQ
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

module.exports = {
  buildMatrixModel,
  getCellModel,
  upsertCellVerification,
  computeAgeLabel,
  getMappingOutcome,
  normalizePlaceKind,
  normalizePageKind,
  normalizeSearchQuery,
  clampInt,
  parseEvidenceJson,
  normalizeOutcome
};
