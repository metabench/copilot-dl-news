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
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { ensureDb, ensureGazetteer } = require('../db/sqlite');
const {
  createAttributeStatements,
  recordAttribute
} = require('../db/sqlite/v1/queries/gazetteer.attributes');
const {
  createDeduplicationStatements,
  findExistingPlace,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  generateCapitalExternalId,
  addCapitalRelationship
} = require('../db/sqlite/v1/queries/gazetteer.deduplication');
const { createPopulateGazetteerQueries } = require('../db/sqlite/v1/queries/gazetteer.populateTool');
const { fetchCountries } = require('./restcountries');
const { findProjectRoot } = require('../utils/project-root');
const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { HttpRequestResponseFacade } = require('../utils/HttpRequestResponseFacade');
const { GazetteerTelemetry } = require('./gazetteer/GazetteerTelemetry');

// Multi-capital countries with correct coordinates per capital
// REST Countries API only provides one latlng - use this map for accuracy
const MULTI_CAPITAL_COORDS = {
  'ZA': {  // South Africa
    'pretoria': [-25.7461, 28.1881],      // Executive capital
    'cape town': [-33.9249, 18.4241],     // Legislative capital
    'bloemfontein': [-29.1211, 26.2140]   // Judicial capital
  },
  'BO': {  // Bolivia
    'la paz': [-16.4897, -68.1193],       // Administrative capital
    'sucre': [-19.0332, -65.2627]         // Constitutional capital
  },
  'MY': {  // Malaysia
    'kuala lumpur': [3.1390, 101.6869],   // De facto capital
    'putrajaya': [2.9264, 101.6964]       // Administrative capital
  },
  'NL': {  // Netherlands
    'amsterdam': [52.3676, 4.9041],       // Constitutional capital
    'the hague': [52.0705, 4.3007]        // Administrative capital
  },
  'BN': {  // Brunei
    'bandar seri begawan': [4.9031, 114.9398]  // Official capital (sometimes split)
  }
};

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'populate-gazetteer',
    'Seed the gazetteer tables from REST Countries and Wikidata'
  );

  const offlineDefault = (() => {
    const env = process.env.RESTCOUNTRIES_OFFLINE;
    if (!env) return false;
    const normalized = env.toString().trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
  })();

  parser
    .add('--db <path>', 'Path to SQLite database', 'data/news.db')
    .add('--countries <csv>', 'Comma-separated ISO country codes', '')
    .add('--region <name>', 'Filter by region name', '')
    .add('--subregion <name>', 'Filter by subregion name', '')
    .add('--include-blocs <csv>', 'Regional blocs to include (ALL or comma-separated list)', 'EU')
    .add('--import-adm1', 'Import ADM1 regions from Wikidata', false, 'boolean')
    .add('--import-adm2', 'Import ADM2 regions from Wikidata', false, 'boolean')
    .add('--import-cities', 'Import top cities from Wikidata', false, 'boolean')
    .add('--cities-per-country <number>', 'Max cities per country when importing', 50, 'number')
    .add('--adm1-limit <number>', 'Maximum ADM1 rows to fetch per country', 200, 'number')
    .add('--adm2-limit <number>', 'Maximum ADM2 rows to fetch per country', 400, 'number')
    .add('--cleanup', 'Run duplicate cleanup after ingestion', false, 'boolean')
    .add('--cleanup-only', 'Run cleanup without ingesting new data', false, 'boolean')
    .add('--offline', 'Use cached REST Countries payload (avoid network)', offlineDefault, 'boolean')
    .add('--rest-retries <number>', 'Retry attempts for REST Countries fetch', 2, 'number')
    .add('--rest-timeout-ms <number>', 'Timeout for REST Countries requests (ms)', 12000, 'number')
    .add('--wikidata-timeout-ms <number>', 'Timeout for Wikidata requests (ms)', 20000, 'number')
    .add('--wikidata-sleep-ms <number>', 'Sleep between Wikidata requests (ms)', 250, 'number')
    .add('--wikidata-cache', 'Cache Wikidata responses to disk', true, 'boolean')
    .add('--force', 'Force re-ingestion even if already completed', false, 'boolean')
    .add('--verbose', 'Enable verbose logging', true, 'boolean')
    .add('--quiet', 'Suppress formatted logs (JSON summary still emitted)', false, 'boolean')
    .add('--json-events', 'Output structured JSON events (NDJSON) for UI integration', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: json | ascii', 'json');

  return parser.parse(argv);
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function resolvePath(projectRoot, input, defaultRelative) {
  const candidate = input && input.length ? input : defaultRelative;
  if (!candidate) return null;
  return path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
}

function normalizeOptions(rawArgs) {
  const projectRoot = findProjectRoot(__dirname);
  const summaryFormat = String(rawArgs.summaryFormat || 'json').trim().toLowerCase();
  if (!['json', 'ascii'].includes(summaryFormat)) {
    throw new Error(`Unsupported summary format: ${rawArgs.summaryFormat}`);
  }

  const countriesFilter = parseCsv(rawArgs.countries).map((code) => code.toUpperCase());
  const includeBlocsRaw = String(rawArgs.includeBlocs || '').trim();
  const includeBlocs = includeBlocsRaw.toUpperCase() === 'ALL'
    ? 'ALL'
    : parseCsv(includeBlocsRaw).map((code) => code.toUpperCase());

  return {
    projectRoot,
    summaryFormat,
    quiet: Boolean(rawArgs.quiet),
    verbose: Boolean(rawArgs.verbose),
    dbPath: resolvePath(projectRoot, rawArgs.db, 'data/news.db'),
    countriesFilter,
    regionFilter: String(rawArgs.region || '').trim(),
    subregionFilter: String(rawArgs.subregion || '').trim(),
    includeBlocs,
    importAdm1: Boolean(rawArgs.importAdm1),
    importAdm2: Boolean(rawArgs.importAdm2),
    importCities: Boolean(rawArgs.importCities),
    maxCitiesPerCountry: Number.isFinite(rawArgs.citiesPerCountry) ? rawArgs.citiesPerCountry : 50,
    adm1Limit: Number.isFinite(rawArgs.adm1Limit) ? rawArgs.adm1Limit : 200,
    adm2Limit: Number.isFinite(rawArgs.adm2Limit) ? rawArgs.adm2Limit : 400,
    offline: Boolean(rawArgs.offline),
    restRetries: Number.isFinite(rawArgs.restRetries) ? rawArgs.restRetries : 2,
    restTimeoutMs: Number.isFinite(rawArgs.restTimeoutMs) ? rawArgs.restTimeoutMs : 12000,
    wikidataTimeoutMs: Number.isFinite(rawArgs.wikidataTimeoutMs) ? rawArgs.wikidataTimeoutMs : 20000,
    wikidataSleepMs: Number.isFinite(rawArgs.wikidataSleepMs) ? rawArgs.wikidataSleepMs : 250,
    wikidataCache: Boolean(rawArgs.wikidataCache),
    force: Boolean(rawArgs.force),
    cleanup: Boolean(rawArgs.cleanup),
    cleanupOnly: Boolean(rawArgs.cleanupOnly),
    jsonEvents: Boolean(rawArgs.jsonEvents)
  };
}

(async () => {
  let options;
  try {
    const rawArgs = parseCliArgs(process.argv);
    options = normalizeOptions(rawArgs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const telemetry = new GazetteerTelemetry({
    jsonMode: options.jsonEvents,
    verbose: options.verbose,
    quiet: options.quiet
  });

  const {
    projectRoot,
    dbPath,
    countriesFilter,
    regionFilter,
    subregionFilter,
    includeBlocs,
    importAdm1,
    importAdm2,
    importCities,
    maxCitiesPerCountry,
    adm1Limit,
    adm2Limit,
    offline,
    restRetries,
    restTimeoutMs,
    wikidataTimeoutMs,
    wikidataSleepMs,
    wikidataCache,
    force,
    summaryFormat,
    quiet,
    verbose
  } = options;

  const raw = ensureDb(dbPath);
  try { ensureGazetteer(raw); } catch (_) {}

  const facade = new HttpRequestResponseFacade(raw);

  const dedupStmts = createDeduplicationStatements(raw);
  const populateQueries = createPopulateGazetteerQueries(raw);

  // Helpers for summarizing existing data
  function getCountryRows() {
    return populateQueries.fetchCountryRows();
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
    return mapCountRows(populateQueries.countPlacesByKind(kindFilter));
  }
  function getCountsRegionByCode(codeField) {
    if (codeField === 'adm1_code') {
      return mapCountRows(populateQueries.countRegionsAdm1ByCountry());
    }
    if (codeField === 'adm2_code') {
      return mapCountRows(populateQueries.countRegionsAdm2ByCountry());
    }
    return {};
  }
  function printExistingSummary(stageLabel) {
    const countriesNow = populateQueries.countTotalByKind('country');
    const citiesNow = populateQueries.countTotalByKind('city');
    const adm1Now = populateQueries.countTotalRegionsAdm1();
    const adm2Now = populateQueries.countTotalRegionsAdm2();
    telemetry.info(`[gazetteer] ${stageLabel} DB summary: countries=${countriesNow}, adm1=${adm1Now}, adm2=${adm2Now}, cities=${citiesNow}`);
    const rows = getCountryRows();
    const citiesPer = getCounts('city');
    const adm1Per = getCountsRegionByCode('adm1_code');
    const adm2Per = getCountsRegionByCode('adm2_code');
    const header = ['CC','Country','ADM1','ADM2','Cities'];
    const lines = [header.join('\t')];
    const tableRows = [];
    for (const r of rows) {
      const cc = (r.cc || '').toUpperCase();
      const line = [cc, r.name || cc, String(adm1Per[cc] || 0), String(adm2Per[cc] || 0), String(citiesPer[cc] || 0)].join('\t');
      lines.push(line);
      tableRows.push({
        CC: cc,
        Country: r.name || cc,
        ADM1: adm1Per[cc] || 0,
        ADM2: adm2Per[cc] || 0,
        Cities: citiesPer[cc] || 0
      });
    }
    if (!quiet && tableRows.length) {
      telemetry.section(`${stageLabel} Snapshot`);
      telemetry.table(tableRows, {
        columns: ['CC', 'Country', 'ADM1', 'ADM2', 'Cities'],
        format: {
          ADM1: (value) => `\x1b[36m${value}\x1b[0m`,
          ADM2: (value) => `\x1b[36m${value}\x1b[0m`,
          Cities: (value) => `\x1b[36m${value}\x1b[0m`
        }
      });
    } else {
      telemetry.info(lines.join('\n'));
    }
  }

  // Capture baseline counts
  const baselineCities = getCounts('city');
  const baselineAdm1 = getCountsRegionByCode('adm1_code');
  const baselineAdm2 = getCountsRegionByCode('adm2_code');
  if (verbose) printExistingSummary('Before import');

  // Register source
  try {
    populateQueries.ensureRestCountriesSource();
  } catch (_) {}

  // Check if this ingestion has already been completed
  try {
    const existingRun = checkIngestionRun(dedupStmts, 'restcountries', 'v3.1', force);
    if (existingRun) {
      const runDate = new Date(existingRun.completed_at).toISOString();
      const summary = { 
        countries: 0, 
        capitals: 0, 
        names: 0, 
        source: 'restcountries@v3.1', 
        skipped: 'already-ingested',
        lastRun: runDate,
        message: `REST Countries v3.1 already ingested at ${runDate}. Use --force=1 to re-ingest.`
      };
      telemetry.info(`[gazetteer] Skipping: already ingested on ${runDate}`);
      telemetry.summary(summary);
      try { raw.close(); } catch (_) {}
      return;
    }
  } catch (_) { /* ignore and proceed */ }
  
  // Fast path: if already populated and no filters/enrichment, skip network fetch
  try {
    const existingCountries = populateQueries.countTotalByKind('country');
    const noFilters = !countriesFilter.length && !regionFilter && !subregionFilter && !importAdm1 && !importCities;
    const populatedEnough = offline ? (existingCountries > 0) : (existingCountries >= 200);
    if (!force && noFilters && populatedEnough) {
      const summary = { countries: 0, capitals: 0, names: 0, source: 'restcountries@v3.1', skipped: 'already-populated' };
      telemetry.summary(summary);
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
      offline
    }, { db: raw, log: (msg) => telemetry.info(msg) });
  } catch (e) {
    telemetry.error(`Failed to fetch REST Countries: ${e.message}`);
    process.exit(1);
  }
  
  // Start ingestion run tracking
  const runId = startIngestionRun(dedupStmts, 'restcountries', 'v3.1', {
    countriesFilter: countriesFilter.length > 0 ? countriesFilter : null,
    importAdm1,
    importCities,
    offline
  });
  telemetry.info(`[gazetteer] Started ingestion run #${runId}`);


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
    try {
      id = populateQueries.findPlaceIdByKindAndNormalizedName('supranational', norm)?.id || null;
    } catch (_) {
      id = null;
    }
    if (id) return id;
    const extra = JSON.stringify({ bloc: acronym });
    id = populateQueries.insertPlace({
      kind: 'supranational',
      countryCode: null,
      population: null,
      timezone: null,
      lat: null,
      lng: null,
      bbox: null,
      canonicalNameId: null,
      source: 'restcountries@v3.1',
      extra
    });
    try {
      populateQueries.insertPlaceName({
        placeId: id,
        name: fullName,
        normalized: norm,
        lang: 'und',
        nameKind: 'endonym',
        isPreferred: true,
        isOfficial: true,
        source: 'restcountries'
      });
    } catch (_) {}
    if (acronym) {
      try {
        populateQueries.insertPlaceName({
          placeId: id,
          name: acronym,
          normalized: normalizeName(acronym),
          lang: 'und',
          nameKind: 'abbrev',
          isPreferred: true,
          isOfficial: false,
          source: 'restcountries'
        });
      } catch (_) {}
    }
    return id;
  }

  const tx = raw.transaction(() => {
    for (const c of data) {
      if (!includeCountry(c)) continue;
      const cc2 = (c.cca2 || '').toUpperCase();
      if (!cc2) continue;
      telemetry.info(`[gazetteer] Upserting country ${cc2} ${c.name?.common ? `(${c.name.common})` : ''}`);

      let pid = null;
      try {
        pid = populateQueries.findCountryByCode(cc2)?.id || null;
      } catch (_) {
        pid = null;
      }

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
        pid = populateQueries.insertPlace({
          kind: 'country',
          countryCode: cc2,
          population: c.population ?? null,
          timezone: primTz,
          lat: latlng ? latlng[0] : null,
          lng: latlng ? latlng[1] : null,
          bbox: null,
          canonicalNameId: null,
          source: 'restcountries@v3.1',
          extra
        });
        countries++;
      } else {
        populateQueries.updatePlace({
          id: pid,
          population: c.population ?? null,
          timezone: primTz,
          lat: latlng ? latlng[0] : null,
          lng: latlng ? latlng[1] : null,
          bbox: null,
          source: 'restcountries@v3.1',
          extra
        });
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

      const addRestCountryName = (placeId, text, lang, kind, preferred, official, normalizedOverride) => {
        if (!text) return;
        populateQueries.insertPlaceName({
          placeId,
          name: text,
          normalized: normalizedOverride || normalizeName(text),
          lang: lang || 'und',
          nameKind: kind || 'endonym',
          isPreferred: Boolean(preferred),
          isOfficial: Boolean(official),
          source: 'restcountries'
        });
        names++;
      };

      const common = c.name?.common || null;
      const official = c.name?.official || null;
      if (common) addRestCountryName(pid, common, 'und', 'common', true, false);
      if (official && official !== common) addRestCountryName(pid, official, 'und', 'official', false, true);

      const native = c.name?.nativeName || {};
      for (const [lang, obj] of Object.entries(native)) {
        const cn = obj?.common || null;
        const on = obj?.official || null;
        if (cn) addRestCountryName(pid, cn, lang, 'endonym', false, false);
        if (on && on !== cn) addRestCountryName(pid, on, lang, 'official', false, true);
      }

      const translations = c.translations || {};
      for (const [lang, obj] of Object.entries(translations)) {
        const cn = obj?.common || null;
        const on = obj?.official || null;
        if (cn) addRestCountryName(pid, cn, lang, 'endonym', false, false);
        if (on && on !== cn) addRestCountryName(pid, on, lang, 'official', false, true);
      }

      const alt = is_array(c.altSpellings) ? c.altSpellings : [];
      for (const a of alt) {
        if (a) addRestCountryName(pid, a, 'und', 'alias', false, false);
      }

      const dem = c.demonyms || {};
      for (const [lang, mf] of Object.entries(dem)) {
        if (mf && tof(mf) === 'object') {
          const f = mf.f || null;
          const m = mf.m || null;
          if (f) addRestCountryName(pid, f, lang, 'demonym', false, false);
          if (m && m !== f) addRestCountryName(pid, m, lang, 'demonym', false, false);
        }
      }

      const capList = is_array(c.capital) ? c.capital : (c.capital ? [c.capital] : []);
      const capInfo = is_array(c.capitalInfo?.latlng) ? c.capitalInfo.latlng : null;

      for (const cap of capList) {
        const normCap = normalizeName(cap);
        const externalId = generateCapitalExternalId('restcountries', cc2, normCap);
        
        // Determine coordinates first (needed for deduplication)
        let capLat = null;
        let capLng = null;
        const multiCapCoords = MULTI_CAPITAL_COORDS[cc2];
        if (multiCapCoords && multiCapCoords[normCap]) {
          capLat = multiCapCoords[normCap][0];
          capLng = multiCapCoords[normCap][1];
        } else if (capInfo) {
          capLat = capInfo[0];
          capLng = capInfo[1];
        }
        
        // Strategy 1: Check if we already have this capital via restcountries external ID
        const existingByExtId = populateQueries.findExternalId('restcountries', externalId);
        let cid = existingByExtId?.id || null;
        
        // Strategy 2: Use multi-strategy deduplication to find existing place
        // This catches Wikidata-imported cities, coordinate proximity matches, etc.
        if (!cid) {
          const existingPlace = findExistingPlace(dedupStmts, {
            normalizedName: normCap,
            countryCode: cc2,
            kind: 'city',
            lat: capLat,
            lng: capLng,
            coordinateThreshold: 0.1  // ~11km - capitals are usually well-defined
          });
          
          if (existingPlace) {
            cid = existingPlace.id;
            // Log the match for debugging
            if (opt.verbose) {
              console.log(`  [dedup] Found existing capital "${cap}" (${cc2}) via ${existingPlace.matchStrategy} → ID ${cid}`);
            }
            // Register the restcountries external ID on the existing place
            try {
              populateQueries.insertExternalId('restcountries', externalId, cid);
            } catch (_) {}
          }
        }

        if (!cid) {
          cid = populateQueries.insertPlace({
            kind: 'city',
            countryCode: cc2,
            population: null,
            timezone: primTz,
            lat: capLat,
            lng: capLng,
            bbox: null,
            canonicalNameId: null,
            source: 'restcountries@v3.1',
            extra: JSON.stringify({ role: 'capital' })
          });
          capitals++;
          try {
            populateQueries.insertExternalId('restcountries', externalId, cid);
          } catch (_) {}
        } else if (capLat && capLng) {
          try {
            populateQueries.updateCoordinatesIfMissing(cid, capLat, capLng);
          } catch (_) {}
        }

        addRestCountryName(cid, cap, 'und', 'endonym', true, false, normCap);

        const cityFetchedAt = Date.now();
        if (capLat && capLng) {
          recordAttribute(attributeStatements, {
            placeId: cid,
            attr: 'lat',
            value: capLat,
            source: attrSource,
            fetchedAt: cityFetchedAt,
            metadata: { provider: 'restcountries', version: 'v3.1', role: 'capital' }
          });
          recordAttribute(attributeStatements, {
            placeId: cid,
            attr: 'lng',
            value: capLng,
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

        addCapitalRelationship(dedupStmts, pid, cid, { source: 'restcountries', version: 'v3.1' });

        try {
          const bestCityName = populateQueries.findBestNameId(cid);
          if (bestCityName) {
            populateQueries.updateCanonicalName(bestCityName, cid);
          }
        } catch (_) {}
      }

      try {
        const bestCountryName = populateQueries.findBestNameId(pid);
        if (bestCountryName) {
          populateQueries.updateCanonicalName(bestCountryName, pid);
        }
      } catch (_) {}

      // Supranational blocs (e.g., EU) membership
      const blocs = is_array(c.regionalBlocs) ? c.regionalBlocs : [];
      for (const b of blocs) {
        const ac = String(b.acronym || '').toUpperCase();
        const nm = b.name || null;
        if (!ac || !nm) continue;
        if (includeBlocs !== 'ALL' && !includeBlocs.includes(ac)) continue;
        const blocId = getOrCreateBloc(ac, nm);
        try {
          populateQueries.insertHierarchyRelation(blocId, pid, 'member_of', null);
        } catch (_) {}
      }
    }
  });

  tx();

  // (Removed file-system cache saving in favor of DB cache in restcountries.js)

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

  // SPARQL query caching via HttpRequestResponseFacade
  async function fetchSparql(query) {
    const qurl = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;

    // Try cache first
    if (wikidataCache) {
      try {
        const cached = facade.getCachedHttpResponse({
          category: 'wikidata',
          subcategory: 'sparql-query',
          requestMethod: 'SPARQL',
          contentCategory: 'sparql',
          contentSubType: 'results',
          query
        });
        if (cached) {
          telemetry.info(`[gazetteer] SPARQL cache hit: ${qurl}`);
          return cached;
        }
      } catch (e) {
        telemetry.warn(`[gazetteer] SPARQL cache read failed: ${e.message}`);
      }
    }

    // Fetch from Wikidata
    const headers = { 'User-Agent': 'copilot-dl-news/1.0 (Wikidata importer)', 'Accept': 'application/sparql-results+json' };
    telemetry.info(`[gazetteer] SPARQL fetch: ${qurl}`);
    const jr = await fetchJson(qurl, headers, wikidataTimeoutMs);

    // Cache the result
    if (wikidataCache) {
      try {
        facade.cacheHttpResponse({
          category: 'wikidata',
          subcategory: 'sparql-query',
          requestMethod: 'SPARQL',
          contentCategory: 'sparql',
          contentSubType: 'results',
          query
        }, jr);
      } catch (e) {
        telemetry.warn(`[gazetteer] SPARQL cache write failed: ${e.message}`);
      }
    }

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
    if (extId) {
      pid = populateQueries.findExternalId(source, extId)?.id || null;
    }
    if (!pid) {
      pid = populateQueries.insertPlace({
        kind,
        countryCode: countryCode || null,
        population: pop || null,
        timezone: null,
        lat: lat || null,
        lng: lng || null,
        bbox: null,
        canonicalNameId: null,
        source,
        extra: null
      });
      created = true;
      if (extId) {
        try { populateQueries.insertExternalId(source, extId, pid); } catch (_) {}
      }
    }
    for (const nm of namesArr || []) {
      if (!nm || !nm.name) continue;
      try {
        populateQueries.insertPlaceName({
          placeId: pid,
          name: nm.name,
          normalized: normalizeName(nm.name),
          lang: nm.lang || 'und',
          nameKind: nm.kind || 'endonym',
          isPreferred: Boolean(nm.preferred),
          isOfficial: Boolean(nm.official),
          source: source || 'wikidata'
        });
      } catch (_) {}
    }
    if (opts.adm1Code) {
      try { populateQueries.updateAdm1IfMissing(opts.adm1Code, pid); } catch (_) {}
    }
    if (opts.adm2Code) {
      try { populateQueries.updateAdm2IfMissing(opts.adm2Code, pid); } catch (_) {}
    }
    try {
      const best = populateQueries.findBestNameId(pid);
      if (best) {
        populateQueries.updateCanonicalName(best, pid);
      }
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
      telemetry.warn(`[gazetteer] Wikidata entity fetch failed: ${e.message} ids: ${idsStr} url: ${url}`);
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
  const countryRows = populateQueries.fetchCountries();
    for (const crow of countryRows) {
      if (countriesFilter.length && !countriesFilter.includes((crow.country_code||'').toUpperCase())) continue;
  telemetry.info(`[gazetteer] Country ${crow.country_code}: importing${importAdm1?' ADM1':''}${importAdm2?' ADM2':''}${importCities?' cities':''} from Wikidata (SPARQL)`);
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
          telemetry.info(`[gazetteer] Cities query for ${crow.country_code} returned ${rows.length}`);
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
            try { populateQueries.insertHierarchyRelation(crow.id, cid, 'admin_parent', 1); } catch (_) {}
          }
        } catch (e) {
          telemetry.warn(`[gazetteer] Cities import failed for ${crow.country_code}: ${e.message}`);
        }
      }
      if (importAdm1) {
        // ADM1 via Wikidata SPARQL (limited); import name + link to country, no polygons
        try {
          const adm1ClassValues = ['wd:Q10864048', 'wd:Q15284', 'wd:Q3336843'].join(' ');
          const sparql = `SELECT ?adm ?admLabel WHERE {
            ?country wdt:P297 "${crow.country_code}".
            VALUES ?admClass { ${adm1ClassValues} }
            ?adm wdt:P31/wdt:P279* ?admClass; wdt:P17 ?country.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,und". }
          } LIMIT ${Math.max(1, Math.min(adm1Limit, 500))}`;
          const jr = await fetchSparql(sparql);
          const rows = (jr.results && jr.results.bindings) || [];
          telemetry.info(`[gazetteer] ADM1 query for ${crow.country_code} returned ${rows.length}`);
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
            try { populateQueries.insertHierarchyRelation(crow.id, rid, 'admin_parent', 1); } catch (_) {}
          }
        } catch (e) {
          telemetry.warn(`[gazetteer] ADM1 import failed for ${crow.country_code}: ${e.message}`);
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
          telemetry.info(`[gazetteer] ADM2 query for ${crow.country_code} returned ${rows.length}`);
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
              parentId = populateQueries.findExternalId('wikidata', parentQ)?.id || null;
            }
            try {
              populateQueries.insertHierarchyRelation(parentId || crow.id, rid, 'admin_parent', 1);
            } catch (_) {}
          }
        } catch (e) {
          telemetry.warn(`[gazetteer] ADM2 import failed for ${crow.country_code}: ${e.message}`);
        }
      }
    }
  }

  // Map countries to Wikidata QIDs via ISO alpha-2 (P297) and store in place_external_ids
  try {
    const ccRows = populateQueries.fetchCountriesWithCodes();
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
            try { populateQueries.insertExternalId('wikidata', qid, row.id); } catch (_) {}
          }
        } catch (_) { /* continue next chunk */ }
      }
    }
  } catch (_) { /* best effort */ }

  // Final summary with counts
  const finalSummary = { countries, capitals, names, adm1: adm1Count, adm2: adm2Count, cities: cityCount, source: 'restcountries@v3.1', rest_all_url: `https://restcountries.com/v3.1/all?fields=${encodeURIComponent('name,cca2,cca3,latlng,capital,capitalInfo,timezones,region,subregion,translations')}` };
  // Cleanup: remove empty names and nameless places
  try {
    populateQueries.trimPlaceNames();
    populateQueries.deleteEmptyPlaceNames();
    populateQueries.deleteNamelessPlaces();
    populateQueries.resetCanonicalNamePointers();
  } catch (_) {}
  if (verbose) {
    printExistingSummary('After import');
    // Per-country delta table: existing(before) vs added in this run
    try {
      const afterCities = getCounts('city');
      const afterAdm1 = getCountsRegionByCode('adm1_code');
      const afterAdm2 = getCountsRegionByCode('adm2_code');
      const rows = getCountryRows();
      const deltaRows = [];
      const header = ['CC','Country','ADM1(exist+added)','ADM2(exist+added)','Cities(exist+added)'];
      const lines = [header.join('\t')];
      for (const r of rows) {
        const cc = (r.cc || '').toUpperCase();
        const e1 = baselineAdm1[cc] || 0; const a1 = Math.max(0, (afterAdm1[cc] || 0) - e1);
        const e2 = baselineAdm2[cc] || 0; const a2 = Math.max(0, (afterAdm2[cc] || 0) - e2);
        const ec = baselineCities[cc] || 0; const ac = Math.max(0, (afterCities[cc] || 0) - ec);
        lines.push([cc, r.name || cc, `${e1}+${a1}`, `${e2}+${a2}`, `${ec}+${ac}`].join('\t'));
        deltaRows.push({
          CC: cc,
          Country: r.name || cc,
          'ADM1 (existing)': e1,
          'ADM1 added': a1,
          'ADM2 (existing)': e2,
          'ADM2 added': a2,
          'Cities (existing)': ec,
          'Cities added': ac
        });
      }
      if (!quiet && deltaRows.length) {
        telemetry.section('Per-country delta');
        telemetry.table(deltaRows, {
          columns: ['CC', 'Country', 'ADM1 (existing)', 'ADM1 added', 'ADM2 (existing)', 'ADM2 added', 'Cities (existing)', 'Cities added'],
          format: {
            'ADM1 (existing)': (value) => `\x1b[36m${value}\x1b[0m`,
            'ADM1 added': (value) => `\x1b[36m${value}\x1b[0m`,
            'ADM2 (existing)': (value) => `\x1b[36m${value}\x1b[0m`,
            'ADM2 added': (value) => `\x1b[36m${value}\x1b[0m`,
            'Cities (existing)': (value) => `\x1b[36m${value}\x1b[0m`,
            'Cities added': (value) => `\x1b[36m${value}\x1b[0m`
          }
        });
      } else {
        telemetry.info(lines.join('\n'));
      }
    } catch (_) {}
  }
  // Complete ingestion run
  try {
    completeIngestionRun(dedupStmts, runId, {
      countries_processed: finalSummary.countries,
      places_created: finalSummary.capitals + (finalSummary.adm1 || 0) + (finalSummary.adm2 || 0) + (finalSummary.cities || 0),
      places_updated: 0,
      names_added: finalSummary.names
    });
    telemetry.info(`[gazetteer] Completed ingestion run #${runId}`);
  } catch (e) {
    telemetry.warn(`[gazetteer] Failed to complete ingestion run: ${e.message}`);
  }
  
  // Run cleanup if requested
  if (options.cleanup || options.cleanupOnly) {
    telemetry.section('Duplicate Cleanup');
    
    // 1. Backfill wikidata_qid from place_external_ids
    try {
      const backfillResult = raw.prepare(`
        UPDATE places
        SET wikidata_qid = (
          SELECT ext_id FROM place_external_ids
          WHERE source = 'wikidata' AND place_id = places.id
        )
        WHERE wikidata_qid IS NULL
          AND EXISTS (
            SELECT 1 FROM place_external_ids
            WHERE source = 'wikidata' AND place_id = places.id
          )
      `).run();
      if (backfillResult.changes > 0) {
        telemetry.info(`[cleanup] Backfilled wikidata_qid for ${backfillResult.changes} places`);
      }
    } catch (e) {
      telemetry.warn(`[cleanup] Failed to backfill wikidata_qid: ${e.message}`);
    }
    
    // 2. Find and merge duplicates
    try {
      // Find duplicate groups by normalized name + country + kind
      const duplicateGroups = raw.prepare(`
        SELECT
          p.country_code,
          p.kind,
          pn.normalized,
          MIN(pn.name) as example_name,
          GROUP_CONCAT(DISTINCT p.id) as ids,
          COUNT(DISTINCT p.id) as count
        FROM places p
        JOIN place_names pn ON p.id = pn.place_id
        WHERE p.kind IS NOT NULL
        GROUP BY p.country_code, p.kind, pn.normalized
        HAVING count > 1
        ORDER BY count DESC
      `).all();
      
      let mergedCount = 0;
      let deletedCount = 0;
      
      for (const group of duplicateGroups) {
        const ids = group.ids.split(',').map(id => parseInt(id, 10));
        
        // Get place details and score them
        const places = raw.prepare(`
          SELECT
            p.id, p.lat, p.lng, p.wikidata_qid, p.population, p.source,
            (SELECT COUNT(*) FROM place_names WHERE place_id = p.id) as name_count
          FROM places p
          WHERE p.id IN (${ids.join(',')})
        `).all();
        
        // Check coordinate proximity (skip if places are far apart)
        const withCoords = places.filter(p => p.lat !== null && p.lng !== null);
        if (withCoords.length >= 2) {
          let tooFar = false;
          for (let i = 0; i < withCoords.length && !tooFar; i++) {
            for (let j = i + 1; j < withCoords.length && !tooFar; j++) {
              const dist = Math.sqrt(
                Math.pow(withCoords[i].lat - withCoords[j].lat, 2) +
                Math.pow(withCoords[i].lng - withCoords[j].lng, 2)
              );
              if (dist > 0.1) tooFar = true; // ~11km threshold
            }
          }
          if (tooFar) continue; // Skip this group, places are too far apart
        }
        
        // Score places: prefer Wikidata, population, more names
        const scored = places.map(p => ({
          ...p,
          score: (p.wikidata_qid ? 1000 : 0) + (p.population ? 500 : 0) + (p.name_count * 10) - (p.source === 'restcountries@v3.1' ? 100 : 0)
        })).sort((a, b) => b.score - a.score);
        
        const keepId = scored[0].id;
        const deleteIds = ids.filter(id => id !== keepId);
        
        if (deleteIds.length === 0) continue;
        
        // Merge in transaction
        raw.transaction(() => {
          for (const dupId of deleteIds) {
            // Transfer unique names
            const uniqueNames = raw.prepare(`
              SELECT id FROM place_names n
              WHERE n.place_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM place_names n2
                WHERE n2.place_id = ? AND n2.normalized = n.normalized AND n2.lang = n.lang AND n2.name_kind = n.name_kind
              )
            `).all(dupId, keepId);
            
            if (uniqueNames.length > 0) {
              raw.prepare(`UPDATE place_names SET place_id = ? WHERE id IN (${uniqueNames.map(n => n.id).join(',')})`).run(keepId);
            }
            raw.prepare(`DELETE FROM place_names WHERE place_id = ?`).run(dupId);
          }
          
          // Transfer/clean hierarchy
          raw.prepare(`UPDATE OR IGNORE place_hierarchy SET child_id = ? WHERE child_id IN (${deleteIds.join(',')})`).run(keepId);
          raw.prepare(`UPDATE OR IGNORE place_hierarchy SET parent_id = ? WHERE parent_id IN (${deleteIds.join(',')})`).run(keepId);
          raw.prepare(`DELETE FROM place_hierarchy WHERE child_id IN (${deleteIds.join(',')}) OR parent_id IN (${deleteIds.join(',')})`).run();
          
          // Transfer/clean attributes
          raw.prepare(`UPDATE OR IGNORE place_attribute_values SET place_id = ? WHERE place_id IN (${deleteIds.join(',')})`).run(keepId);
          raw.prepare(`DELETE FROM place_attribute_values WHERE place_id IN (${deleteIds.join(',')})`).run();
          
          // Transfer/clean external IDs
          raw.prepare(`UPDATE OR IGNORE place_external_ids SET place_id = ? WHERE place_id IN (${deleteIds.join(',')})`).run(keepId);
          raw.prepare(`DELETE FROM place_external_ids WHERE place_id IN (${deleteIds.join(',')})`).run();
          
          // Delete duplicate places
          raw.prepare(`DELETE FROM places WHERE id IN (${deleteIds.join(',')})`).run();
          
          mergedCount++;
          deletedCount += deleteIds.length;
        })();
        
        if (verbose) {
          telemetry.info(`[cleanup] Merged "${group.example_name}" (${group.kind}, ${group.country_code}): kept ID ${keepId}, deleted ${deleteIds.length}`);
        }
      }
      
      if (mergedCount > 0) {
        telemetry.info(`[cleanup] Merged ${mergedCount} duplicate sets, deleted ${deletedCount} records`);
        finalSummary.cleanup = { merged: mergedCount, deleted: deletedCount };
      } else {
        telemetry.info(`[cleanup] No duplicates found to merge`);
      }
    } catch (e) {
      telemetry.warn(`[cleanup] Failed to merge duplicates: ${e.message}`);
    }
  }
  
  telemetry.summary(finalSummary);
  try { raw.close(); } catch (_) {}
})();
