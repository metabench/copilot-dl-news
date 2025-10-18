"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.gazetteerCountry");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    countryByCode: handle.prepare(`
      SELECT p.id, p.country_code, p.population, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'country' AND p.country_code = ?
      GROUP BY p.id
    `),
    regionCount: handle.prepare(`
      SELECT COUNT(1) AS count
      FROM places p
      WHERE p.kind = 'region' AND p.country_code = ?
    `),
    regionListLimited: handle.prepare(`
      SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'region' AND p.country_code = ?
      GROUP BY p.id
      ORDER BY name ASC
      LIMIT ?
    `),
    regionListAll: handle.prepare(`
      SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'region' AND p.country_code = ?
      GROUP BY p.id
      ORDER BY name ASC
    `),
    cityCount: handle.prepare(`
      SELECT COUNT(1) AS count
      FROM places p
      WHERE p.kind = 'city' AND p.country_code = ?
    `),
    cityListLimited: handle.prepare(`
      SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'city' AND p.country_code = ?
      GROUP BY p.id
      ORDER BY p.population DESC, name ASC
      LIMIT ?
    `),
    cityListAll: handle.prepare(`
      SELECT p.id, p.kind, p.country_code, p.adm1_code, p.population, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'city' AND p.country_code = ?
      GROUP BY p.id
      ORDER BY p.population DESC, name ASC
    `),
    regionAndCityCounts: handle.prepare(`
      SELECT
        (SELECT COUNT(1) FROM places WHERE kind = 'region' AND country_code = ?) AS region_count,
        (SELECT COUNT(1) FROM places WHERE kind = 'city' AND country_code = ?) AS city_count
    `),
    topCities: handle.prepare(`
      SELECT p.id, p.population, p.adm1_code, COALESCE(cn.name, pn.name) AS name
      FROM places p
      LEFT JOIN place_names pn ON pn.place_id = p.id
      LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
      WHERE p.kind = 'city' AND p.country_code = ?
      GROUP BY p.id
      ORDER BY p.population DESC, name ASC
      LIMIT ?
    `),
    sizePlace: handle.prepare(`
      SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS b
      FROM places
      WHERE id = ?
    `),
    sizeNames: handle.prepare(`
      SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS b
      FROM place_names
      WHERE place_id = ?
    `),
    sizeExternal: handle.prepare(`
      SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS b
      FROM place_external_ids
      WHERE place_id = ?
    `),
    sizeHierarchy: handle.prepare(`
      SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS b
      FROM place_hierarchy
      WHERE parent_id = ? OR child_id = ?
    `)
  }));
}

function getCountryByCode(db, countryCode) {
  const { countryByCode } = prepareStatements(db);
  return countryByCode.get(countryCode);
}

function getRegionCount(db, countryCode) {
  const { regionCount } = prepareStatements(db);
  const row = regionCount.get(countryCode);
  return row && typeof row.count === "number" ? row.count : 0;
}

function listRegions(db, countryCode, limit) {
  const { regionListLimited, regionListAll } = prepareStatements(db);
  if (Number.isFinite(limit) && limit > 0) {
    return regionListLimited.all(countryCode, Math.trunc(limit));
  }
  return regionListAll.all(countryCode);
}

function getCityCount(db, countryCode) {
  const { cityCount } = prepareStatements(db);
  const row = cityCount.get(countryCode);
  return row && typeof row.count === "number" ? row.count : 0;
}

function listCities(db, countryCode, limit) {
  const { cityListLimited, cityListAll } = prepareStatements(db);
  if (Number.isFinite(limit) && limit > 0) {
    return cityListLimited.all(countryCode, Math.trunc(limit));
  }
  return cityListAll.all(countryCode);
}

function getRegionAndCityCounts(db, countryCode) {
  const { regionAndCityCounts } = prepareStatements(db);
  const row = regionAndCityCounts.get(countryCode, countryCode) || {};
  return {
    regionCount: row.region_count || 0,
    cityCount: row.city_count || 0
  };
}

function listTopCities(db, countryCode, limit) {
  const { topCities } = prepareStatements(db);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 5;
  return topCities.all(countryCode, safeLimit);
}

function createPlaceSizeCalculator(db) {
  const { sizePlace, sizeNames, sizeExternal, sizeHierarchy } = prepareStatements(db);
  const memo = new Map();
  return (placeId) => {
    if (memo.has(placeId)) {
      return memo.get(placeId);
    }
    const place = sizePlace.get(placeId)?.b || 0;
    const names = sizeNames.get(placeId)?.b || 0;
    const external = sizeExternal.get(placeId)?.b || 0;
    const hierarchy = sizeHierarchy.get(placeId, placeId)?.b || 0;
    const total = (place + names + external + hierarchy) | 0;
    memo.set(placeId, total);
    return total;
  };
}

module.exports = {
  getCountryByCode,
  getRegionCount,
  listRegions,
  getCityCount,
  listCities,
  getRegionAndCityCounts,
  listTopCities,
  createPlaceSizeCalculator
};
