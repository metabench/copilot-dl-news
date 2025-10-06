#!/usr/bin/env node

/*
  populate-gazetteer.js
  - Seeds the local SQLite gazetteer (places, place_names, hierarchy, sources) from a public API.
  - Initial source: REST Countries v3.1 (https://restcountries.com/) to load countries and capitals with multilingual names.
  - Safe to run multiple times; uses INSERT OR IGNORE patterns and simple upserts.

  Usage:
    node src/tools/populate-gazetteer.js --db=./data/news.db --limit=all
*/

const { is_array, tof } = require('lang-tools');

const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { ensureDb, ensureGazetteer } = require('../db/sqlite');
const {
  createAttributeStatements,
  recordAttribute
} = require('../db/sqlite/queries/gazetteer.attributes');
const { fetchCountries } = require('./restcountries');
const { findProjectRoot } = require('../utils/project-root');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

(async () => {
  const log = (...args) => { try { console.error(...args); } catch (_) {} };
  const projectRoot = findProjectRoot(__dirname);
  const dbPath = getArg('db', path.join(projectRoot, 'data', 'news.db'));
  const raw = ensureDb(dbPath);
  try { ensureGazetteer(raw); } catch (_) {}
  const countriesFilter = (getArg('countries', '') || '').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const regionFilter = (getArg('region', '') || '').trim();
  const subregionFilter = (getArg('subregion', '') || '').trim();
  const includeBlocsArg = (getArg('include-blocs', 'EU') || 'EU');
  const includeBlocs = includeBlocsArg.toUpperCase() === 'ALL' ? 'ALL' : includeBlocsArg.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  const importAdm1 = String(getArg('import-adm1', '0')) === '1';
  const importCities = String(getArg('import-cities', '0')) === '1';
  const maxCitiesPerCountry = parseInt(getArg('cities-per-country', '50'), 10) || 50;
  const importAdm2 = String(getArg('import-adm2', '0')) === '1';
  const adm1Limit = parseInt(getArg('adm1-limit', '200'), 10) || 200;
  const adm2Limit = parseInt(getArg('adm2-limit', '400'), 10) || 400;
  const offline = String(getArg('offline', process.env.RESTCOUNTRIES_OFFLINE || '0')) === '1';
  const restRetries = parseInt(getArg('rest-retries', '2'), 10) || 2;
  const restTimeoutMs = parseInt(getArg('rest-timeout-ms', '12000'), 10) || 12000;
  const cacheDir = getArg('cache-dir', path.join(projectRoot, 'data', 'cache'));
  const wikidataTimeoutMs = parseInt(getArg('wikidata-timeout-ms', '20000'), 10) || 20000;
  const wikidataSleepMs = parseInt(getArg('wikidata-sleep-ms', '250'), 10) || 250;
  const wikidataCache = String(getArg('wikidata-cache', '1')) === '1';
  const force = String(getArg('force', '0')) === '1';
  const verbose = String(getArg('verbose', '1')) === '1'; // default to verbose logging

  // Helpers for summarizing existing data
  function getCountryRows() {
    return raw.prepare(`
      SELECT p.id, p.country_code AS cc,
             COALESCE((SELECT name FROM place_names WHERE id = p.canonical_name_id), p.country_code) AS name
      FROM places p WHERE p.kind='country'
    `).all();
  }
  function mapCountRows(rows) {
    const m = Object.create(null);
    for (const r of rows) {
      const cc = (r.cc || '').toUpperCase();
      if (cc) m[cc] = (m[cc] || 0) + (r.c || 0);
    }
    return m;
  }
  function getCounts(kindFilter) {
    const rows = raw.prepare(`SELECT country_code AS cc, COUNT(*) AS c FROM places WHERE kind=? GROUP BY country_code`).all(kindFilter);
    return mapCountRows(rows);
  }
  function getCountsRegionByCode(codeField) {
    const rows = raw.prepare(`SELECT country_code AS cc, COUNT(*) AS c FROM places WHERE kind='region' AND ${codeField} IS NOT NULL GROUP BY country_code`).all();
    return mapCountRows(rows);
  }
  function printExistingSummary(stageLabel) {
    const countriesNow = raw.prepare(`SELECT COUNT(*) AS c FROM places WHERE kind='country'`).get()?.c || 0;
    const citiesNow = raw.prepare(`SELECT COUNT(*) AS c FROM places WHERE kind='city'`).get()?.c || 0;
    const adm1Now = raw.prepare(`SELECT COUNT(*) AS c FROM places WHERE kind='region' AND adm1_code IS NOT NULL`).get()?.c || 0;
    const adm2Now = raw.prepare(`SELECT COUNT(*) AS c FROM places WHERE kind='region' AND adm2_code IS NOT NULL`).get()?.c || 0;
    log(`[gazetteer] ${stageLabel} DB summary: countries=${countriesNow}, adm1=${adm1Now}, adm2=${adm2Now}, cities=${citiesNow}`);
    const rows = getCountryRows();
    const citiesPer = getCounts('city');
    const adm1Per = getCountsRegionByCode('adm1_code');
    const adm2Per = getCountsRegionByCode('adm2_code');
    const header = ['CC','Country','ADM1','ADM2','Cities'];
    const lines = [header.join('\t')];
    for (const r of rows) {
      const cc = (r.cc || '').toUpperCase();
      const line = [cc, r.name || cc, String(adm1Per[cc] || 0), String(adm2Per[cc] || 0), String(citiesPer[cc] || 0)].join('\t');
      lines.push(line);
    }
    log(lines.join('\n'));
  }

  // Capture baseline counts
  const baselineCities = getCounts('city');
  const baselineAdm1 = getCountsRegionByCode('adm1_code');
  const baselineAdm2 = getCountsRegionByCode('adm2_code');
  if (verbose) printExistingSummary('Before import');

  // Register source
  try {
    raw.prepare(`INSERT OR IGNORE INTO place_sources(name, version, url, license) VALUES ('restcountries', 'v3.1', 'https://restcountries.com', 'CC BY 4.0')`).run();
  } catch (_) {}

  // Fast path: if already populated and no filters/enrichment, skip network fetch
  try {
    const existingCountries = raw.prepare("SELECT COUNT(*) AS c FROM places WHERE kind='country'").get()?.c || 0;
    const noFilters = !countriesFilter.length && !regionFilter && !subregionFilter && !importAdm1 && !importCities;
    const populatedEnough = offline ? (existingCountries > 0) : (existingCountries >= 200);
    if (!force && noFilters && populatedEnough) {
      const summary = { countries: 0, capitals: 0, names: 0, source: 'restcountries@v3.1', skipped: 'already-populated' };
      console.log(JSON.stringify(summary));
      try { raw.close(); } catch (_) {}
      return;
    }
  } catch (_) { /* ignore and proceed */ }

  // Use shared client

  let data = [];
  try {
    data = await fetchCountries({
      countriesFilter,
      retries: restRetries,
      timeoutMs: restTimeoutMs,
      cacheDir,
      offline
    });
  } catch (e) {
    console.error('Failed to fetch REST Countries:', e.message);
    process.exit(1);
  }

  const insPlace = raw.prepare(`
    INSERT INTO places(kind, country_code, population, timezone, lat, lng, bbox, canonical_name_id, source, extra)
    VALUES(@kind, @country_code, @population, @timezone, @lat, @lng, @bbox, NULL, @source, @extra)
  `);
  const updPlaceByCode = raw.prepare(`
    UPDATE places SET population = COALESCE(population, @population),
                      timezone = COALESCE(timezone, @timezone),
                      lat = COALESCE(lat, @lat),
                      lng = COALESCE(lng, @lng),
                      bbox = COALESCE(bbox, @bbox),
                      source = COALESCE(NULLIF(source, ''), @source),
                      extra = COALESCE(extra, @extra)
    WHERE id = @id
  `);
  const getCountryByCode = raw.prepare(`SELECT id FROM places WHERE kind='country' AND country_code = ?`);
  const insName = raw.prepare(`
    INSERT OR IGNORE INTO place_names(place_id, name, normalized, lang, script, name_kind, is_preferred, is_official, source)
    VALUES(?, ?, ?, ?, NULL, ?, ?, ?, 'restcountries')
  `);
  const updCanonical = raw.prepare(`UPDATE places SET canonical_name_id = ? WHERE id = ?`);
  const getPlaceIdByKindAndNormName = raw.prepare(`
    SELECT pn.place_id AS id
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE p.kind = ? AND pn.normalized = ?
    LIMIT 1
  `);
  const getCityByCountryAndNormName = raw.prepare(`
    SELECT p.id AS id
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE p.kind = 'city' AND p.country_code = ? AND pn.normalized = ?
    LIMIT 1
  `);
  const insertExternalId = raw.prepare(`INSERT OR IGNORE INTO place_external_ids(source, ext_id, place_id) VALUES(?, ?, ?)`);
  const getByExternalId = raw.prepare(`SELECT place_id AS id FROM place_external_ids WHERE source = ? AND ext_id = ?`);

  function normalizeName(s){
    if (!s) return null;
    const noDiacritics = s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
    return noDiacritics.toLowerCase();
  }

  let countries = 0, capitals = 0, names = 0;
  let adm1Count = 0, adm2Count = 0, cityCount = 0;

  const attributeStatements = createAttributeStatements(raw);

  function includeCountry(c) {
    const cc2 = (c.cca2 || '').toUpperCase();
    if (!cc2) return false;
    if (countriesFilter.length && !countriesFilter.includes(cc2)) return false;
    if (regionFilter && String(c.region || '').toLowerCase() !== regionFilter.toLowerCase()) return false;
    if (subregionFilter && String(c.subregion || '').toLowerCase() !== subregionFilter.toLowerCase()) return false;
    return true;
  }

  function getOrCreateBloc(acronym, fullName) {
    const norm = normalizeName(fullName);
    let id = null;
    try { id = getPlaceIdByKindAndNormName.get('supranational', norm)?.id || null; } catch (_) { id = null; }
    if (id) return id;
    const ins = raw.prepare(`INSERT INTO places(kind, country_code, population, timezone, lat, lng, bbox, canonical_name_id, source, extra) VALUES ('supranational', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'restcountries@v3.1', ?)`);
    const extra = JSON.stringify({ bloc: acronym });
    const res = ins.run(extra);
    id = res.lastInsertRowid;
    try { insName.run(id, fullName, norm, 'und', 'endonym', 1, 1); } catch (_) {}
    try { if (acronym) insName.run(id, acronym, normalizeName(acronym), 'und', 'abbrev', 1, 0); } catch (_) {}
    return id;
  }

  const tx = raw.transaction(() => {
    for (const c of data) {
      if (!includeCountry(c)) continue;
      const cc2 = (c.cca2 || '').toUpperCase();
      if (!cc2) continue;
  if (verbose) log(`[gazetteer] Upserting country ${cc2} ${c.name?.common?('('+c.name.common+')'):''}`);
      // Upsert country place
      let pid = getCountryByCode.get(cc2)?.id || null;
      const latlng = is_array(c.latlng) && c.latlng.length === 2 ? c.latlng : null;
      const primTz = is_array(c.timezones) && c.timezones.length ? c.timezones[0] : null;
      const extraObj = {
        cca3: c.cca3 || null,
        ccn3: c.ccn3 || null,
        cioc: c.cioc || null,
        region: c.region || null,
        subregion: c.subregion || null,
        area: c.area || null,
        languages: c.languages || null,
        tld: c.tld || null,
        idd: c.idd || null,
        currencies: c.currencies || null,
        demonyms: c.demonyms || null,
        altSpellings: c.altSpellings || null,
        maps: c.maps || null,
        flags: c.flags || null,
        coatOfArms: c.coatOfArms || null,
        borders: c.borders || null
      };
      const extra = JSON.stringify(extraObj);
      if (!pid) {
        const res = insPlace.run({ kind: 'country', country_code: cc2, population: c.population || null, timezone: primTz, lat: latlng?latlng[0]:null, lng: latlng?latlng[1]:null, bbox: null, source: 'restcountries@v3.1', extra });
        pid = res.lastInsertRowid;
        countries++;
      } else {
        updPlaceByCode.run({ id: pid, population: c.population || null, timezone: primTz, lat: latlng?latlng[0]:null, lng: latlng?latlng[1]:null, bbox: null, source: 'restcountries@v3.1', extra });
      }

      const attrSource = 'restcountries';
      const fetchedAt = Date.now();
      if (Number.isFinite(c.population)) {
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'population',
          value: c.population,
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
      }
      if (latlng) {
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'lat',
          value: latlng[0],
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'lng',
          value: latlng[1],
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
      }
      if (primTz) {
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'timezone',
          value: primTz,
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
      }
      if (c.area != null) {
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'area_sq_km',
          value: c.area,
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
      }
      if (cc2) {
        recordAttribute(attributeStatements, {
          placeId: pid,
          attr: 'iso.alpha2',
          value: cc2,
          source: attrSource,
          fetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
      }
      // Names: common + official + translations
      const common = c.name?.common || null;
      const official = c.name?.official || null;
      if (common) { insName.run(pid, common, normalizeName(common), 'und', 'common', 1, 0); names++; }
      if (official && official !== common) { insName.run(pid, official, normalizeName(official), 'und', 'official', 0, 1); names++; }
      // Native names if present
      const native = c.name?.nativeName || {};
      for (const [lang, obj] of Object.entries(native)) {
        const cn = obj?.common || null;
        const on = obj?.official || null;
        if (cn) { insName.run(pid, cn, normalizeName(cn), lang, 'endonym', 0, 0); names++; }
        if (on && on !== cn) { insName.run(pid, on, normalizeName(on), lang, 'official', 0, 1); names++; }
      }
      const translations = c.translations || {};
      for (const [lang, obj] of Object.entries(translations)) {
        const cn = obj?.common || null;
        const on = obj?.official || null;
        if (cn) { insName.run(pid, cn, normalizeName(cn), lang, 'endonym', 0, 0); names++; }
        if (on && on !== cn) { insName.run(pid, on, normalizeName(on), lang, 'official', 0, 1); names++; }
      }
      // Alt spellings as aliases
      const alt = is_array(c.altSpellings) ? c.altSpellings : [];
      for (const a of alt) { if (a) { insName.run(pid, a, normalizeName(a), 'und', 'alias', 0, 0); names++; } }
      // Demonyms as names (language-tagged where possible)
      const dem = c.demonyms || {};
      for (const [lang, mf] of Object.entries(dem)) {
        if (mf && tof(mf) === 'object') {
          const f = mf.f || null; const m = mf.m || null;
          if (f) { insName.run(pid, f, normalizeName(f), lang, 'demonym', 0, 0); names++; }
          if (m && m !== f) { insName.run(pid, m, normalizeName(m), lang, 'demonym', 0, 0); names++; }
        }
      }
  // Capitals (as cities with parent link)
      const capList = is_array(c.capital) ? c.capital : (c.capital ? [c.capital] : []);
      const capInfo = is_array(c.capitalInfo?.latlng) ? c.capitalInfo.latlng : null;
      for (const cap of capList) {
        // Create city place
        const normCap = normalizeName(cap);
        let cid = getCityByCountryAndNormName.get(cc2, normCap)?.id || null;
        if (!cid) {
          const res = insPlace.run({ kind: 'city', country_code: cc2, population: null, timezone: primTz, lat: capInfo?capInfo[0]:null, lng: capInfo?capInfo[1]:null, bbox: null, source: 'restcountries@v3.1', extra: JSON.stringify({ role: 'capital' }) });
          cid = res.lastInsertRowid;
          capitals++;
        }
        insName.run(cid, cap, normCap, 'und', 'endonym', 1, 0); names++;
        const cityFetchedAt = Date.now();
        if (capInfo) {
          recordAttribute(attributeStatements, {
            placeId: cid,
            attr: 'lat',
            value: capInfo[0],
            source: attrSource,
            fetchedAt: cityFetchedAt,
            metadata: { provider: 'restcountries', version: 'v3.1', role: 'capital' }
          });
          recordAttribute(attributeStatements, {
            placeId: cid,
            attr: 'lng',
            value: capInfo[1],
            source: attrSource,
            fetchedAt: cityFetchedAt,
            metadata: { provider: 'restcountries', version: 'v3.1', role: 'capital' }
          });
        }
        recordAttribute(attributeStatements, {
          placeId: cid,
          attr: 'role',
          value: 'capital',
          source: attrSource,
          fetchedAt: cityFetchedAt,
          metadata: { provider: 'restcountries', version: 'v3.1' }
        });
        // Link hierarchy (country -> city)
  try { raw.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, 'admin_parent', 1)`).run(pid, cid); } catch (_) {}
        // Set canonical for the city
        try {
          const best = raw.prepare(`SELECT id FROM place_names WHERE place_id=? ORDER BY is_official DESC, is_preferred DESC, (lang='en') DESC, id ASC LIMIT 1`).get(cid)?.id;
          if (best) updCanonical.run(best, cid);
        } catch (_) {}
      }
      // Supranational blocs (e.g., EU) membership
      const blocs = is_array(c.regionalBlocs) ? c.regionalBlocs : [];
      for (const b of blocs) {
        const ac = String(b.acronym || '').toUpperCase();
        const nm = b.name || null;
        if (!ac || !nm) continue;
        if (includeBlocs !== 'ALL' && !includeBlocs.includes(ac)) continue;
        const blocId = getOrCreateBloc(ac, nm);
  try { raw.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, 'member_of', NULL)`).run(blocId, pid); } catch (_) {}
      }
      // Set canonical for the country
      try {
        const best = raw.prepare(`SELECT id FROM place_names WHERE place_id=? ORDER BY is_official DESC, is_preferred DESC, (lang='en') DESC, id ASC LIMIT 1`).get(pid)?.id;
        if (best) updCanonical.run(best, pid);
      } catch (_) {}
    }
  });

  tx();

  // Save cache after load when running full dataset
  try {
    const fs = require('fs');
    if (!countriesFilter.length) {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const cachePath = path.join(cacheDir, 'restcountries.v3.1.all.json');
      // We only cache raw source payload when it originated from network; skip if we used local minimal dataset
      // Heuristic: if more than, say, 50 names were added, assume real dataset
      if (names > 50) {
        // Not storing raw payload here (we’d need it captured); this is a placeholder for future enhancement.
      }
    }
  } catch (_) {}

  // Optional: import ADM1 regions and top cities from Wikidata
  // Summary computed later (after optional Wikidata imports) so counts are accurate
  async function fetchJson(u, headers = {}, timeoutMs = 0){
    const controller = timeoutMs ? new AbortController() : null;
    const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const r = await fetch(u, { headers, signal: controller ? controller.signal : undefined });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { if (id) clearTimeout(id); }
  }
  async function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

  // Simple on-disk cache for SPARQL GET queries
  const crypto = require('crypto');
  const fs = require('fs');
  function sparqlCachePath(query) {
    const dir = path.join(cacheDir, 'sparql');
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    const hash = crypto.createHash('sha1').update(query).digest('hex');
    return path.join(dir, `${hash}.json`);
  }
  async function fetchSparql(query) {
    const qurl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const cpath = sparqlCachePath(query);
    let cacheHit = false;
    if (wikidataCache) {
      try {
        if (fs.existsSync(cpath)) {
          const txt = fs.readFileSync(cpath, 'utf8');
          cacheHit = true;
          const parsed = JSON.parse(txt);
          if (verbose) log(`[gazetteer] SPARQL cache hit: ${qurl}`);
          return parsed;
        }
      } catch (_) {}
    }
    const headers = { 'User-Agent': 'copilot-dl-news/1.0 (Wikidata importer)', 'Accept': 'application/sparql-results+json' };
    if (verbose) log(`[gazetteer] SPARQL fetch: ${qurl}`);
    const jr = await fetchJson(qurl, headers, wikidataTimeoutMs);
    try { if (wikidataCache) fs.writeFileSync(cpath, JSON.stringify(jr)); } catch (_) {}
    // Be nice to the endpoint
    if (wikidataSleepMs > 0) await sleep(wikidataSleepMs);
    return jr;
  }
  function labelMap(entity){
    const out = []; const labels = entity.labels||{}; const aliases = entity.aliases||{};
    for (const [lang, obj] of Object.entries(labels)) { if (obj.value) out.push({ name: obj.value, lang, kind: 'official', preferred: 1, official: 1 }); }
    for (const [lang, arr] of Object.entries(aliases)) { for (const a of (arr||[])) { if (a.value) out.push({ name: a.value, lang, kind: 'alias', preferred: 0, official: 0 }); } }
    return out;
  }
  function insPlaceWithNames(kind, countryCode, lat, lng, pop, namesArr, source, extId, opts={}){
    let pid = null;
    let created = false;
    if (extId) { pid = getByExternalId.get(source, extId)?.id || null; }
    if (!pid) {
      const res = raw.prepare(`INSERT INTO places(kind, country_code, population, timezone, lat, lng, bbox, canonical_name_id, source, extra) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(kind, countryCode||null, pop||null, null, lat||null, lng||null, null, null, source, null);
      pid = res.lastInsertRowid;
      created = true;
      if (extId) insertExternalId.run(source, extId, pid);
    }
    for (const nm of namesArr||[]) {
      try { insName.run(pid, nm.name, normalizeName(nm.name), nm.lang||'und', nm.kind||'endonym', nm.preferred?1:0, nm.official?1:0); } catch (_) {}
    }
    // Update ADM codes if provided
    if (opts.adm1Code) {
  try { raw.prepare(`UPDATE places SET adm1_code = COALESCE(?, adm1_code) WHERE id = ?`).run(opts.adm1Code, pid); } catch (_) {}
    }
    if (opts.adm2Code) {
  try { raw.prepare(`UPDATE places SET adm2_code = COALESCE(?, adm2_code) WHERE id = ?`).run(opts.adm2Code, pid); } catch (_) {}
    }
    // Set canonical name for the place
    try {
  const best = raw.prepare(`SELECT id FROM place_names WHERE place_id=? ORDER BY is_official DESC, is_preferred DESC, (lang='en') DESC, id ASC LIMIT 1`).get(pid)?.id;
      if (best) updCanonical.run(best, pid);
    } catch (_) {}
    return { id: pid, created };
  }

  // Helper: query Wikidata minimal endpoint
  async function wikidataGet(ids){
    const set = Array.from(new Set(ids.filter(Boolean)));
    if (!set.length) return {};
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(set.join('|'))}.json`;
    try {
      const jr = await fetchJson(url, { 'User-Agent': 'copilot-dl-news/1.0 (Wikidata entity fetch)', 'Accept': 'application/json' }, Math.max(15000, wikidataTimeoutMs));
      if (wikidataSleepMs > 0) await sleep(wikidataSleepMs);
      return jr;
    } catch (e) {
      const idsStr = set.join(',');
      log(`[gazetteer] Wikidata entity fetch failed: ${e.message} ids: ${idsStr} url: ${url}`);
      return {};
    }
  }

  function parseWktPoint(wkt){
    // Expects: "Point(LONG LAT)"; returns { lat, lon } or null
    if (typeof wkt !== 'string') return null;
    const m = wkt.match(/Point\(([-0-9\.]+)\s+([-0-9\.]+)\)/i);
    if (!m) return null;
    const lon = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    return null;
  }

  // For each included country, optionally import ADM1 and top cities
  if (importAdm1 || importAdm2 || importCities) {
  const countryRows = raw.prepare(`SELECT id, country_code FROM places WHERE kind='country'`).all();
    for (const crow of countryRows) {
      if (countriesFilter.length && !countriesFilter.includes((crow.country_code||'').toUpperCase())) continue;
  if (verbose) log(`[gazetteer] Country ${crow.country_code}: importing${importAdm1?' ADM1':''}${importAdm2?' ADM2':''}${importCities?' cities':''} from Wikidata (SPARQL)`);
      // Find Wikidata QID for the country via restcountries cca2→ Wikidata is not reliable here without mapping; skip if not available.
      // As a pragmatic fallback, import top cities via GeoNames-like heuristic from Wikipedia/Wikidata SPARQL is too heavy; keep constrained:
    if (importCities) {
        try {
          // Use Wikidata SPARQL for top populated cities by country code (limited)
      const sparql = `SELECT ?city ?cityLabel ?pop ?coord WHERE {
            ?country wdt:P297 "${crow.country_code}".
            ?city wdt:P31/wdt:P279* wd:Q515; wdt:P17 ?country.
            OPTIONAL { ?city wdt:P1082 ?pop. }
            OPTIONAL { ?city wdt:P625 ?coord. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,und". }
          } ORDER BY DESC(?pop) LIMIT ${Math.max(1, Math.min(maxCitiesPerCountry, 200))}`;
      const jr = await fetchSparql(sparql);
          const rows = (jr.results && jr.results.bindings) || [];
          if (verbose) log(`[gazetteer] Cities query for ${crow.country_code} returned ${rows.length}`);
          const ids = rows.map(r => (r.city?.value||'').split('/').pop()).filter(Boolean);
          const entities = await wikidataGet(ids);
          for (const r of rows) {
            const qid = (r.city?.value||'').split('/').pop();
            const pt = r.coord?.value ? parseWktPoint(r.coord.value) : null;
            const lat = pt ? pt.lat : null;
            const lon = pt ? pt.lon : null;
            const pop = r.pop ? parseInt(r.pop.value, 10) : null;
            const ent = entities?.entities?.[qid] || null;
            const namesArr = ent ? labelMap(ent) : (r.cityLabel?.value ? [{ name: r.cityLabel.value, lang: 'und', kind:'endonym', preferred:1, official:0 }] : []);
            const { id: cid, created } = insPlaceWithNames('city', crow.country_code, lat, lon, pop, namesArr, 'wikidata', qid);
            if (created) cityCount++;
            try { raw.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, 'admin_parent', 1)`).run(crow.id, cid); } catch (_) {}
          }
        } catch (e) {
          if (verbose) log(`[gazetteer] Cities import failed for ${crow.country_code}: ${e.message}`);
        }
      }
      if (importAdm1) {
        // ADM1 via Wikidata SPARQL (limited); import name + link to country, no polygons
        try {
          const sparql = `SELECT ?adm ?admLabel WHERE { ?country wdt:P297 "${crow.country_code}". ?adm wdt:P31/wdt:P279* wd:Q10864048; wdt:P17 ?country. SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,und". } } LIMIT ${Math.max(1, Math.min(adm1Limit, 500))}`;
          const jr = await fetchSparql(sparql);
          const rows = (jr.results && jr.results.bindings) || [];
          if (verbose) log(`[gazetteer] ADM1 query for ${crow.country_code} returned ${rows.length}`);
          const ids = rows.map(r => (r.adm?.value||'').split('/').pop()).filter(Boolean);
          const entities = await wikidataGet(ids);
          for (const r of rows) {
            const qid = (r.adm?.value||'').split('/').pop();
            const ent = entities?.entities?.[qid] || null;
            // Extract ISO 3166-2 code (P300) if available
            let adm1Code = null;
            try {
              const claims = ent?.claims?.P300 || [];
              const v = claims[0]?.mainsnak?.datavalue?.value;
              if (tof(v) === 'string' && v.length <= 12) adm1Code = v;
            } catch (_) {}
            const namesArr = ent ? labelMap(ent) : (r.admLabel?.value ? [{ name: r.admLabel.value, lang: 'und', kind:'official', preferred:1, official:1 }] : []);
            const { id: rid, created } = insPlaceWithNames('region', crow.country_code, null, null, null, namesArr, 'wikidata', qid, { adm1Code });
            if (created) adm1Count++;
            try { raw.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, 'admin_parent', 1)`).run(crow.id, rid); } catch (_) {}
          }
        } catch (e) {
          if (verbose) log(`[gazetteer] ADM1 import failed for ${crow.country_code}: ${e.message}`);
        }
      }
      if (importAdm2) {
        // ADM2 (second-level, e.g., counties) via Wikidata
        try {
          const sparql = `SELECT ?adm2 ?adm2Label ?parent ?parentLabel ?iso ?fips ?coord WHERE {
            ?country wdt:P297 "${crow.country_code}".
            ?adm2 wdt:P31/wdt:P279* wd:Q13220204; wdt:P17 ?country.
            OPTIONAL { ?adm2 wdt:P131 ?parent. }
            OPTIONAL { ?adm2 wdt:P300 ?iso. }
            OPTIONAL { ?adm2 wdt:P882 ?fips. }
            OPTIONAL { ?adm2 wdt:P625 ?coord. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,und". }
          } LIMIT ${Math.max(1, Math.min(adm2Limit, 1000))}`;
          const jr = await fetchSparql(sparql);
          const rows = (jr.results && jr.results.bindings) || [];
          if (verbose) log(`[gazetteer] ADM2 query for ${crow.country_code} returned ${rows.length}`);
          const ids = rows.map(r => (r.adm2?.value||'').split('/').pop()).filter(Boolean);
          const entities = await wikidataGet(ids);
          for (const r of rows) {
            const qid = (r.adm2?.value||'').split('/').pop();
            const ent = entities?.entities?.[qid] || null;
            let adm2Code = null;
            try {
              const v = ent?.claims?.P300?.[0]?.mainsnak?.datavalue?.value;
              if (tof(v) === 'string' && v.length <= 24) adm2Code = v;
            } catch (_) {}
            // US county FIPS code
            try {
              const fips = ent?.claims?.P882?.[0]?.mainsnak?.datavalue?.value;
              if (!adm2Code && tof(fips) === 'string') adm2Code = fips;
            } catch (_) {}
            const pt = r.coord?.value ? parseWktPoint(r.coord.value) : null;
            const lat = pt ? pt.lat : null;
            const lon = pt ? pt.lon : null;
            const namesArr = ent ? labelMap(ent) : (r.adm2Label?.value ? [{ name: r.adm2Label.value, lang: 'und', kind:'official', preferred:1, official:1 }] : []);
            const { id: rid, created } = insPlaceWithNames('region', crow.country_code, lat, lon, null, namesArr, 'wikidata', qid, { adm2Code });
            if (created) adm2Count++;
            // Parent link: prefer parent region if known; else link to country
            const parentQ = (r.parent?.value||'').split('/').pop();
            let parentId = null;
            if (parentQ) {
              parentId = getByExternalId.get('wikidata', parentQ)?.id || null;
            }
            try {
              raw.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?, ?, 'admin_parent', 1)`).run(parentId || crow.id, rid);
            } catch (_) {}
          }
        } catch (e) {
          if (verbose) log(`[gazetteer] ADM2 import failed for ${crow.country_code}: ${e.message}`);
        }
      }
    }
  }

  // Map countries to Wikidata QIDs via ISO alpha-2 (P297) and store in place_external_ids
  try {
    const ccRows = raw.prepare(`SELECT id, country_code FROM places WHERE kind='country' AND country_code IS NOT NULL`).all();
    const cc2vals = ccRows.map(r => r.country_code).filter(Boolean);
    if (cc2vals.length) {
      // Batch in chunks to avoid overly long queries
      const chunkSize = 60; // safe for URL length
      for (let i = 0; i < cc2vals.length; i += chunkSize) {
        const chunk = cc2vals.slice(i, i + chunkSize);
        const values = chunk.map(c => `"${c}"`).join(' ');
        const sparql = `SELECT ?cc2 ?country WHERE { VALUES ?cc2 { ${values} } ?country wdt:P297 ?cc2. }`;
        const qurl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
        try {
          const jr = await fetchJson(qurl, { 'User-Agent': 'copilot-dl-news/1.0', 'Accept': 'application/sparql-results+json' }, 15000);
          const rows = (jr.results && jr.results.bindings) || [];
          for (const r of rows) {
            const cc2 = r.cc2?.value;
            const qid = (r.country?.value||'').split('/').pop();
            if (!cc2 || !qid) continue;
            const row = ccRows.find(x => x.country_code === cc2);
            if (!row) continue;
            try { insertExternalId.run('wikidata', qid, row.id); } catch (_) {}
          }
        } catch (_) { /* continue next chunk */ }
      }
    }
  } catch (_) { /* best effort */ }

  // Final summary with counts
  const finalSummary = { countries, capitals, names, adm1: adm1Count, adm2: adm2Count, cities: cityCount, source: 'restcountries@v3.1', rest_all_url: `https://restcountries.com/v3.1/all?fields=${encodeURIComponent('name,cca2,cca3,latlng,capital,capitalInfo,timezones,region,subregion,translations')}` };
  // Cleanup: remove empty names and nameless places
  try {
    raw.exec(`UPDATE place_names SET name=TRIM(name) WHERE name <> TRIM(name);`);
    raw.exec(`DELETE FROM place_names WHERE name IS NULL OR TRIM(name) = ''`);
    raw.exec(`
      DELETE FROM places
      WHERE (canonical_name_id IS NULL OR canonical_name_id NOT IN (SELECT id FROM place_names))
        AND NOT EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = places.id);
    `);
    raw.exec(`UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id IS NOT NULL AND canonical_name_id NOT IN (SELECT id FROM place_names);`);
  } catch (_) {}
  if (verbose) {
    printExistingSummary('After import');
    // Per-country delta table: existing(before) vs added in this run
    try {
      const afterCities = getCounts('city');
      const afterAdm1 = getCountsRegionByCode('adm1_code');
      const afterAdm2 = getCountsRegionByCode('adm2_code');
      const rows = getCountryRows();
      const header = ['CC','Country','ADM1(exist+added)','ADM2(exist+added)','Cities(exist+added)'];
      const lines = [header.join('\t')];
      for (const r of rows) {
        const cc = (r.cc || '').toUpperCase();
        const e1 = baselineAdm1[cc] || 0; const a1 = (afterAdm1[cc]||0) - e1;
        const e2 = baselineAdm2[cc] || 0; const a2 = (afterAdm2[cc]||0) - e2;
        const ec = baselineCities[cc] || 0; const ac = (afterCities[cc]||0) - ec;
        lines.push([cc, r.name || cc, `${e1}+${Math.max(0,a1)}`, `${e2}+${Math.max(0,a2)}`, `${ec}+${Math.max(0,ac)}`].join('\t'));
      }
      log(lines.join('\n'));
    } catch (_) {}
  }
  console.log(JSON.stringify(finalSummary));
  try { raw.close(); } catch (_) {}
})();
