'use strict';

/**
 * ingestAdminAreas — the ADM2 (county / district / department) ingestion
 * loop as a REUSABLE, dependency-injectable callable, extracted from the
 * CLI-embedded run() in populate-gazetteer.js (A7).
 *
 * populate-gazetteer's copy lives inside a 1000-line closure and cannot be
 * imported; the in-app background task (IngestAdminAreasTask) needs a
 * callable that runs IN the Electron process against the live db without
 * the app-stop dance. This module is that callable. Persistence composes
 * ncdb primitives (createPopulateGazetteerQueries + listAdminClasses); the
 * network is injected (fetchSparql / fetchEntities) so it is unit-testable
 * with canned Wikidata JSON and has no hidden I/O.
 *
 * @param {object} db  better-sqlite3 handle (the live news.db or :memory:)
 * @param {object} opts
 * @param {string[]} opts.countries        ISO-3166 alpha-2 codes to ingest
 * @param {number}   [opts.limit=200]      max rows per class (WDQS LIMIT)
 * @param {object[]} [opts.classesByCountry] override: {countryCode -> rows};
 *                                          else verified admin_class_map rows
 * @param {function} [opts.fetchSparql]     async (query) => {results:{bindings}}
 * @param {function} [opts.fetchEntities]   async (ids[]) => {entities}
 * @param {object}   [opts.logger]          {info, warn}
 * @param {AbortSignal} [opts.signal]       cooperative cancellation
 * @param {function} [opts.onProgress]      ({country, classQid, created,...})
 * @returns {Promise<{created,existing,failed,byClass,errors}>} honest counters
 */
async function ingestAdminAreas(db, opts = {}) {
  const ncdb = require('news-crawler-db');
  const {
    countries = [],
    limit = 200,
    classesByCountry = null,
    // currentOnly (default true) excludes entities with a dissolution date
    // (P576) — a P279* class walk otherwise pulls in historical/abolished
    // districts (DE Q106658: 639 with history vs 295 current). You almost
    // never want dissolved admin areas in a current gazetteer.
    currentOnly = true,
    logger = { info() {}, warn() {} },
    signal = null,
    onProgress = null,
  } = opts;

  const fetchSparql = opts.fetchSparql || defaultFetchSparql;
  const fetchEntities = opts.fetchEntities || defaultFetchEntities;
  const q = ncdb.createPopulateGazetteerQueries(db);

  const result = { created: 0, existing: 0, failed: 0, byClass: {}, errors: [] };

  for (const rawCode of countries) {
    if (signal?.aborted) throw new Error('ingestAdminAreas aborted');
    const countryCode = String(rawCode || '').toUpperCase();
    const country = q.findCountryByCode(countryCode);
    if (!country) {
      logger.warn(`[ingest-admin] country ${countryCode} not in gazetteer — skipping`);
      continue;
    }

    const classes = classesByCountry
      ? (classesByCountry[countryCode] || [])
      : ncdb.listAdminClasses(db, { countryCode, adminLevel: 2 }); // verifiedOnly default
    if (!classes.length) {
      logger.info(`[ingest-admin] no verified admin_class_map rows for ${countryCode} level 2 — skipping`);
      continue;
    }

    for (const cls of classes) {
      if (signal?.aborted) throw new Error('ingestAdminAreas aborted');
      const classKey = `${countryCode}/${cls.wikidataClassQid}`;
      const perClass = { created: 0, existing: 0, failed: 0, returned: 0 };
      try {
        // subclass_walk=0 → direct P31 only (umbrella classes over-match on
        // the P279* tree; NI: 60 rows for 11 districts).
        const classPath = cls.subclassWalk === 0 ? 'wdt:P31' : 'wdt:P31/wdt:P279*';
        const currentFilter = currentOnly ? 'FILTER NOT EXISTS { ?adm2 wdt:P576 ?dissolved }' : '';
        const sparql = `SELECT ?adm2 ?adm2Label ?parent ?iso ?fips ?coord WHERE {
            ?country wdt:P297 "${countryCode}".
            ?adm2 ${classPath} wd:${cls.wikidataClassQid}; wdt:P17 ?country.
            ${currentFilter}
            OPTIONAL { ?adm2 wdt:P131 ?parent. }
            OPTIONAL { ?adm2 wdt:P300 ?iso. }
            OPTIONAL { ?adm2 wdt:P882 ?fips. }
            OPTIONAL { ?adm2 wdt:P625 ?coord. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
          } LIMIT ${Math.max(1, Math.min(limit, 1000))}`;

        const jr = await fetchSparql(sparql);
        const rows = (jr?.results?.bindings) || [];
        perClass.returned = rows.length;
        logger.info(`[ingest-admin] ${classKey} (${cls.label || cls.placeKind}) returned ${rows.length}`);

        const ids = rows.map((r) => (r.adm2?.value || '').split('/').pop()).filter(Boolean);
        const entities = (await fetchEntities(ids))?.entities || {};

        for (const r of rows) {
          if (signal?.aborted) throw new Error('ingestAdminAreas aborted');
          const qid = (r.adm2?.value || '').split('/').pop();
          try {
            const ent = entities[qid] || null;
            let adm2Code = strClaim(ent, 'P300', 24);
            if (!adm2Code) adm2Code = strClaim(ent, 'P882', 24); // US FIPS fallback
            const pt = r.coord?.value ? parseWktPoint(r.coord.value) : null;
            const namesArr = ent ? labelMap(ent)
              : (r.adm2Label?.value ? [{ name: r.adm2Label.value, lang: 'und', kind: 'official', preferred: 1, official: 1 }] : []);

            const { created } = upsertPlaceWithNames(q, {
              kind: cls.placeKind, countryCode, lat: pt?.lat ?? null, lng: pt?.lon ?? null,
              namesArr, source: 'wikidata', extId: qid, adm2Code,
            });
            if (created) { perClass.created++; result.created++; }
            else { perClass.existing++; result.existing++; }

            const parentQ = (r.parent?.value || '').split('/').pop();
            const parentId = parentQ ? (q.findExternalId('wikidata', parentQ)?.id || null) : null;
            try { q.insertHierarchyRelation(parentId || country.id, findExtId(q, qid), 'admin_parent', 1); } catch (_) {}
          } catch (rowErr) {
            perClass.failed++; result.failed++;
            result.errors.push(`${classKey}:${qid}: ${rowErr.message}`);
            logger.warn(`[ingest-admin] row failed ${classKey}:${qid}: ${rowErr.message}`);
          }
        }
      } catch (classErr) {
        result.errors.push(`${classKey}: ${classErr.message}`);
        logger.warn(`[ingest-admin] class failed ${classKey}: ${classErr.message}`);
      }
      result.byClass[classKey] = perClass;
      if (onProgress) { try { onProgress({ country: countryCode, classQid: cls.wikidataClassQid, ...perClass }); } catch (_) {} }
    }
  }

  return result;
}

// ── helpers (faithful ports of populate-gazetteer's inner closures) ────────

function normalizeName(s) {
  if (!s) return null;
  return s.normalize('NFD').replace(/\p{Diacritic}+/gu, '').toLowerCase();
}

function labelMap(entity) {
  const out = [];
  const labels = entity.labels || {};
  const aliases = entity.aliases || {};
  for (const [lang, obj] of Object.entries(labels)) {
    if (obj.value) out.push({ name: obj.value, lang, kind: 'official', preferred: 1, official: 1 });
  }
  for (const [lang, arr] of Object.entries(aliases)) {
    for (const a of (arr || [])) {
      if (a.value) out.push({ name: a.value, lang, kind: 'alias', preferred: 0, official: 0 });
    }
  }
  return out;
}

function parseWktPoint(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/i);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
}

function strClaim(ent, prop, maxLen) {
  try {
    const v = ent?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
    return (typeof v === 'string' && v.length <= maxLen) ? v : null;
  } catch (_) { return null; }
}

function findExtId(q, qid) {
  return q.findExternalId('wikidata', qid)?.id || null;
}

function upsertPlaceWithNames(q, { kind, countryCode, lat, lng, namesArr, source, extId, adm2Code }) {
  let pid = extId ? (q.findExternalId(source, extId)?.id || null) : null;
  let created = false;
  if (!pid) {
    pid = q.insertPlace({
      kind, countryCode: countryCode || null, adm1Code: null, adm2Code: adm2Code || null,
      population: null, timezone: null, lat: lat || null, lng: lng || null, bbox: null,
      canonicalNameId: null, source, extra: null,
    });
    created = true;
    if (extId) { try { q.insertExternalId(source, extId, pid); } catch (_) {} }
  }
  for (const nm of namesArr || []) {
    if (!nm || !nm.name) continue;
    try {
      q.insertPlaceName({
        placeId: pid, name: nm.name, normalized: normalizeName(nm.name),
        lang: nm.lang || 'und', nameKind: nm.kind || 'endonym',
        isPreferred: Boolean(nm.preferred), isOfficial: Boolean(nm.official),
        source: source || 'wikidata',
      });
    } catch (_) {}
  }
  if (adm2Code && typeof q.updateAdm2IfMissing === 'function') {
    try { q.updateAdm2IfMissing(adm2Code, pid); } catch (_) {}
  }
  try {
    const best = q.findBestNameId(pid);
    if (best) q.updateCanonicalName(best, pid);
  } catch (_) {}
  return { id: pid, created };
}

// ── default network implementations (real WDQS / wbgetentities) ────────────

async function defaultFetchSparql(query) {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'copilot-dl-news/1.0 (admin-area ingest)', Accept: 'application/sparql-results+json' },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`WDQS HTTP ${res.status}`);
  return res.json();
}

async function defaultFetchEntities(ids) {
  const set = Array.from(new Set((ids || []).filter(Boolean)));
  if (!set.length) return { entities: {} };
  const BATCH = 50;
  const aggregate = {};
  for (let i = 0; i < set.length; i += BATCH) {
    const batch = set.slice(i, i + BATCH);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join('|'))}&format=json&props=labels%7Caliases%7Cclaims`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'copilot-dl-news/1.0 (Wikidata entity fetch)', Accept: 'application/json' },
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`wbgetentities HTTP ${res.status}`);
    const jr = await res.json();
    if (jr?.entities) Object.assign(aggregate, jr.entities);
  }
  return { entities: aggregate };
}

module.exports = { ingestAdminAreas };
