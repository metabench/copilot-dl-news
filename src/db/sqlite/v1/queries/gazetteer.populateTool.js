'use strict';

function createPopulateGazetteerQueries(db) {
  const countryRowsStmt = db.prepare(`
    SELECT p.id, p.country_code AS cc,
           COALESCE((SELECT name FROM place_names WHERE id = p.canonical_name_id), p.country_code) AS name
    FROM places p
    WHERE p.kind = 'country'
  `);

  const countPlacesByKindPerCountryStmt = db.prepare(`
    SELECT country_code AS cc, COUNT(*) AS c
    FROM places
    WHERE kind = ?
    GROUP BY country_code
  `);

  const countRegionsAdm1PerCountryStmt = db.prepare(`
    SELECT country_code AS cc, COUNT(*) AS c
    FROM places
    WHERE kind = 'region' AND adm1_code IS NOT NULL
    GROUP BY country_code
  `);

  const countRegionsAdm2PerCountryStmt = db.prepare(`
    SELECT country_code AS cc, COUNT(*) AS c
    FROM places
    WHERE kind = 'region' AND adm2_code IS NOT NULL
    GROUP BY country_code
  `);

  const countPlacesByKindTotalStmt = db.prepare(`
    SELECT COUNT(*) AS c
    FROM places
    WHERE kind = ?
  `);

  const countRegionsAdm1TotalStmt = db.prepare(`
    SELECT COUNT(*) AS c
    FROM places
    WHERE kind = 'region' AND adm1_code IS NOT NULL
  `);

  const countRegionsAdm2TotalStmt = db.prepare(`
    SELECT COUNT(*) AS c
    FROM places
    WHERE kind = 'region' AND adm2_code IS NOT NULL
  `);

  const ensureRestCountriesSourceStmt = db.prepare(`
    INSERT OR IGNORE INTO place_sources(name, version, url, license)
    VALUES ('restcountries', 'v3.1', 'https://restcountries.com', 'CC BY 4.0')
  `);

  const insertPlaceStmt = db.prepare(`
    INSERT INTO places(
      kind, country_code, population, timezone, lat, lng, bbox,
      canonical_name_id, source, extra
    ) VALUES(
      @kind, @country_code, @population, @timezone, @lat, @lng, @bbox,
      @canonical_name_id, @source, @extra
    )
  `);

  const updatePlaceStmt = db.prepare(`
    UPDATE places SET
      population = COALESCE(population, @population),
      timezone = COALESCE(timezone, @timezone),
      lat = COALESCE(lat, @lat),
      lng = COALESCE(lng, @lng),
      bbox = COALESCE(bbox, @bbox),
      source = COALESCE(NULLIF(source, ''), @source),
      extra = COALESCE(extra, @extra)
    WHERE id = @id
  `);

  const getCountryByCodeStmt = db.prepare(`
    SELECT id
    FROM places
    WHERE kind = 'country' AND country_code = ?
  `);

  const insertNameStmt = db.prepare(`
    INSERT OR IGNORE INTO place_names(
      place_id, name, normalized, lang, script, name_kind, is_preferred, is_official, source
    ) VALUES(
      ?, ?, ?, ?, NULL, ?, ?, ?, ?
    )
  `);

  const updateCanonicalStmt = db.prepare(`
    UPDATE places SET canonical_name_id = ? WHERE id = ?
  `);

  const getPlaceIdByKindAndNormNameStmt = db.prepare(`
    SELECT pn.place_id AS id
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE p.kind = ? AND pn.normalized = ?
    LIMIT 1
  `);

  const getCityByCountryAndNormNameStmt = db.prepare(`
    SELECT p.id AS id
    FROM place_names pn
    JOIN places p ON p.id = pn.place_id
    WHERE p.kind = 'city' AND p.country_code = ? AND pn.normalized = ?
    LIMIT 1
  `);

  const insertExternalIdStmt = db.prepare(`
    INSERT OR IGNORE INTO place_external_ids(source, ext_id, place_id)
    VALUES(?, ?, ?)
  `);

  const getExternalIdStmt = db.prepare(`
    SELECT place_id AS id FROM place_external_ids WHERE source = ? AND ext_id = ?
  `);

  const updateCoordsIfMissingStmt = db.prepare(`
    UPDATE places
    SET lat = COALESCE(lat, ?),
        lng = COALESCE(lng, ?)
    WHERE id = ?
  `);

  const selectBestNameStmt = db.prepare(`
    SELECT id
    FROM place_names
    WHERE place_id = ?
    ORDER BY is_official DESC, is_preferred DESC, (lang = 'en') DESC, id ASC
    LIMIT 1
  `);

  const insertHierarchyRelationStmt = db.prepare(`
    INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth)
    VALUES(?, ?, ?, ?)
  `);

  const updateAdm1Stmt = db.prepare(`
    UPDATE places SET adm1_code = COALESCE(?, adm1_code) WHERE id = ?
  `);

  const updateAdm2Stmt = db.prepare(`
    UPDATE places SET adm2_code = COALESCE(?, adm2_code) WHERE id = ?
  `);

  const selectCountriesStmt = db.prepare(`
    SELECT id, country_code
    FROM places
    WHERE kind = 'country'
  `);

  const selectCountriesWithCodeStmt = db.prepare(`
    SELECT id, country_code
    FROM places
    WHERE kind = 'country' AND country_code IS NOT NULL
  `);

  const trimPlaceNamesStmt = db.prepare(`
    UPDATE place_names SET name = TRIM(name) WHERE name <> TRIM(name)
  `);

  const deleteEmptyNamesStmt = db.prepare(`
    DELETE FROM place_names WHERE name IS NULL OR TRIM(name) = ''
  `);

  const deleteNamelessPlacesStmt = db.prepare(`
    DELETE FROM places
    WHERE (canonical_name_id IS NULL OR canonical_name_id NOT IN (SELECT id FROM place_names))
      AND NOT EXISTS(
        SELECT 1 FROM place_names pn WHERE pn.place_id = places.id
      )
  `);

  const resetCanonicalStmt = db.prepare(`
    UPDATE places
    SET canonical_name_id = NULL
    WHERE canonical_name_id IS NOT NULL
      AND canonical_name_id NOT IN (SELECT id FROM place_names)
  `);

  function fetchCountryRows() {
    return countryRowsStmt.all();
  }

  function countPlacesByKind(kind) {
    return countPlacesByKindPerCountryStmt.all(kind);
  }

  function countRegionsAdm1ByCountry() {
    return countRegionsAdm1PerCountryStmt.all();
  }

  function countRegionsAdm2ByCountry() {
    return countRegionsAdm2PerCountryStmt.all();
  }

  function countTotalByKind(kind) {
    const row = countPlacesByKindTotalStmt.get(kind);
    return row ? row.c || 0 : 0;
  }

  function countTotalRegionsAdm1() {
    const row = countRegionsAdm1TotalStmt.get();
    return row ? row.c || 0 : 0;
  }

  function countTotalRegionsAdm2() {
    const row = countRegionsAdm2TotalStmt.get();
    return row ? row.c || 0 : 0;
  }

  function ensureRestCountriesSource() {
    ensureRestCountriesSourceStmt.run();
  }

  function insertPlace(params) {
    const payload = {
      kind: params.kind,
      country_code: params.countryCode ?? null,
      population: params.population ?? null,
      timezone: params.timezone ?? null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      bbox: params.bbox ?? null,
      canonical_name_id: params.canonicalNameId ?? null,
      source: params.source ?? null,
      extra: params.extra ?? null
    };
    const result = insertPlaceStmt.run(payload);
    return result.lastInsertRowid;
  }

  function updatePlace(params) {
    updatePlaceStmt.run({
      id: params.id,
      population: params.population ?? null,
      timezone: params.timezone ?? null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
      bbox: params.bbox ?? null,
      source: params.source ?? null,
      extra: params.extra ?? null
    });
  }

  function findCountryByCode(code) {
    return getCountryByCodeStmt.get(code);
  }

  function insertPlaceName({
    placeId,
    name,
    normalized,
    lang,
    nameKind,
    isPreferred,
    isOfficial,
    source
  }) {
    insertNameStmt.run(
      placeId,
      name,
      normalized,
      lang || 'und',
      nameKind || 'endonym',
      isPreferred ? 1 : 0,
      isOfficial ? 1 : 0,
      source || 'restcountries'
    );
  }

  function updateCanonicalName(canonicalId, placeId) {
    updateCanonicalStmt.run(canonicalId, placeId);
  }

  function findPlaceIdByKindAndNormalizedName(kind, normalized) {
    return getPlaceIdByKindAndNormNameStmt.get(kind, normalized);
  }

  function findCityByCountryAndNormalizedName(countryCode, normalized) {
    return getCityByCountryAndNormNameStmt.get(countryCode, normalized);
  }

  function insertExternalId(source, extId, placeId) {
    insertExternalIdStmt.run(source, extId, placeId);
  }

  function findExternalId(source, extId) {
    return getExternalIdStmt.get(source, extId);
  }

  function updateCoordinatesIfMissing(placeId, lat, lng) {
    updateCoordsIfMissingStmt.run(lat ?? null, lng ?? null, placeId);
  }

  function findBestNameId(placeId) {
    const row = selectBestNameStmt.get(placeId);
    return row ? row.id || null : null;
  }

  function insertHierarchyRelation(parentId, childId, relation, depth) {
    insertHierarchyRelationStmt.run(parentId, childId, relation, depth ?? null);
  }

  function updateAdm1IfMissing(adm1Code, placeId) {
    updateAdm1Stmt.run(adm1Code ?? null, placeId);
  }

  function updateAdm2IfMissing(adm2Code, placeId) {
    updateAdm2Stmt.run(adm2Code ?? null, placeId);
  }

  function fetchCountries() {
    return selectCountriesStmt.all();
  }

  function fetchCountriesWithCodes() {
    return selectCountriesWithCodeStmt.all();
  }

  function trimPlaceNames() {
    trimPlaceNamesStmt.run();
  }

  function deleteEmptyPlaceNames() {
    deleteEmptyNamesStmt.run();
  }

  function deleteNamelessPlaces() {
    deleteNamelessPlacesStmt.run();
  }

  function resetCanonicalNamePointers() {
    resetCanonicalStmt.run();
  }

  return {
    fetchCountryRows,
    countPlacesByKind,
    countRegionsAdm1ByCountry,
    countRegionsAdm2ByCountry,
    countTotalByKind,
    countTotalRegionsAdm1,
    countTotalRegionsAdm2,
    ensureRestCountriesSource,
    insertPlace,
    updatePlace,
    findCountryByCode,
    insertPlaceName,
    updateCanonicalName,
    findPlaceIdByKindAndNormalizedName,
    findCityByCountryAndNormalizedName,
    insertExternalId,
    findExternalId,
    updateCoordinatesIfMissing,
    findBestNameId,
    insertHierarchyRelation,
    updateAdm1IfMissing,
    updateAdm2IfMissing,
    fetchCountries,
    fetchCountriesWithCodes,
    trimPlaceNames,
    deleteEmptyPlaceNames,
    deleteNamelessPlaces,
    resetCanonicalNamePointers
  };
}

module.exports = { createPopulateGazetteerQueries };
