const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { findProjectRoot } = require('../utils/project-root');

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(u, { headers = {}, timeoutMs = 0 } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(u, { headers, signal: controller ? controller.signal : undefined });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} ${body?.slice?.(0, 200) || ''}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally { if (id) clearTimeout(id); }
}

// options: { countriesFilter: ["GB","IE"], retries, timeoutMs, cacheDir, offline }
async function fetchCountries(options = {}, deps = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const {
    countriesFilter = [],
    retries = 2,
    timeoutMs = 12000,
    cacheDir = path.join(projectRoot, 'data', 'cache'),
    offline = false,
  } = options;
  const log = deps.log || ((...a) => console.warn(...a));
  const headers = { 'User-Agent': 'copilot-dl-news/1.0', 'Accept': 'application/json' };
  // Per docs: for /all you MUST specify fields and up to 10 fields only.
  // Keep requests within 10 fields to avoid 400 responses.
  const minimalFields10 = 'name,cca2,cca3,latlng,capital,capitalInfo,timezones,region,subregion,translations';
  const altFields10 = 'name,cca2,cca3,latlng,capital,capitalInfo,region,subregion,translations,population';

  async function tryFetch(endpoint, fields) {
    const u = new URL(endpoint);
    if (fields) u.searchParams.set('fields', fields);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt === 0) log(`restcountries: GET ${u.toString()}`);
        return await fetchJson(u.toString(), { headers, timeoutMs });
      } catch (err) {
        log(`restcountries: ${err.message} on ${u.toString()} (attempt ${attempt+1}/${retries+1})`);
        await sleep(200 * (attempt + 1));
      }
    }
    return null;
  }

  async function tryRegions(fields) {
    const regions = ['Africa','Americas','Asia','Europe','Oceania','Antarctic'];
    const seen = new Set();
    const out = [];
    for (const r of regions) {
      const base = `https://restcountries.com/v3.1/region/${encodeURIComponent(r)}`;
      const json = await tryFetch(base, fields);
      if (!json || !Array.isArray(json)) continue;
      for (const c of json) {
        const code = (c.cca2 || '').toUpperCase();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        out.push(c);
      }
    }
    return out.length ? out : null;
  }

  // Offline short-circuit: use local minimal or cache without networking
  if (offline) {
    try {
      const p = path.join(__dirname, 'restcountries.min.json');
      if (fs.existsSync(p)) {
        const txt = fs.readFileSync(p, 'utf8');
        let parsed = JSON.parse(txt);
        if (countriesFilter.length) {
          const set = new Set(countriesFilter.map(c => String(c).toUpperCase()));
          parsed = parsed.filter(c => set.has(String(c.cca2 || '').toUpperCase()));
        }
        log('restcountries: offline mode using local minimal fallback');
        return parsed;
      }
    } catch (_) {}
    const cachePathOnly = path.join(cacheDir, 'restcountries.v3.1.all.json');
    try {
      if (fs.existsSync(cachePathOnly)) {
        const txt = fs.readFileSync(cachePathOnly, 'utf8');
        let parsed = JSON.parse(txt);
        if (countriesFilter.length) {
          const set = new Set(countriesFilter.map(c => String(c).toUpperCase()));
          parsed = parsed.filter(c => set.has(String(c.cca2 || '').toUpperCase()));
        }
        log('restcountries: offline mode using cached dataset');
        return parsed;
      }
    } catch (_) {}
    // As a last offline resort, return empty list
    return [];
  }

  // Cache path
  const cachePath = path.join(cacheDir, 'restcountries.v3.1.all.json');
  if (fs.existsSync(cachePath) && countriesFilter.length === 0) {
    try {
      const txt = fs.readFileSync(cachePath, 'utf8');
      const parsed = JSON.parse(txt);
      log('restcountries: using cached dataset');
      return parsed;
    } catch (_) {}
  }

  const codes = countriesFilter.length ? countriesFilter.join(',') : null;
  if (codes) {
    const base = `https://restcountries.com/v3.1/alpha?codes=${encodeURIComponent(codes)}`;
    let json = await tryFetch(base, minimalFields10);
    if (!json) json = await tryFetch(base, altFields10);
    if (json) return json;
  }

  let json = await tryFetch('https://restcountries.com/v3.1/all', minimalFields10);
  if (!json) json = await tryFetch('https://restcountries.com/v3.1/all', altFields10);
  if (json) return json;

  json = await tryRegions(minimalFields10) || await tryRegions(altFields10);
  if (json) return json;

  // Local minimal fallback next to the tool
  try {
    const p = path.join(__dirname, 'restcountries.min.json');
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(txt);
      log('restcountries: using local minimal fallback');
      return parsed;
    }
  } catch (_) {}

  // mledoze dataset fallback
  try {
    const url = 'https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json';
    const arr = await fetchJson(url, { headers, timeoutMs: 15000 });
    const mapped = (arr || []).map(x => ({
      name: { common: x.name?.common, official: x.name?.official, nativeName: x.name?.nativeName },
      cca2: x.cca2, cca3: x.cca3, ccn3: x.ccn3, cioc: x.cioc,
      latlng: x.latlng, capital: x.capital, capitalInfo: x.capitalInfo || null,
      translations: x.translations || {},
      area: x.area, population: x.population,
      timezones: x.timezones, region: x.region, subregion: x.subregion,
      languages: x.languages, tld: x.tld, idd: x.idd, currencies: x.currencies,
      demonyms: x.demonyms, altSpellings: x.altSpellings,
      maps: x.maps, flags: x.flags, coatOfArms: x.coatOfArms, borders: x.borders,
      regionalBlocs: x.regionalBlocs || []
    }));
    log('restcountries: using mledoze fallback');
    return mapped;
  } catch (_) {}

  throw new Error('All REST Countries attempts failed');
}

module.exports = { fetchCountries };
