/**
 * Gazetteer places query functions
 *
 * Database access layer for querying places table with normalized access patterns.
 * Used by planning services, gap analysis tools, and hub discovery utilities.
 */

/**
 * Get all countries from gazetteer with their preferred names
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{name: string, code: string, importance: number, population: number, wikidataQid: string}>}
 */
function getAllCountries(db) {
  try {
    const countries = db.prepare(`
      WITH country_names AS (
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
          p.wikidata_qid AS wikidataQid,
          COALESCE(p.population, 0) AS population
        FROM places p
        WHERE p.kind = 'country'
          AND p.country_code IS NOT NULL
      )
      SELECT name, code, importance, wikidataQid, population
      FROM country_names
      WHERE name IS NOT NULL
      ORDER BY importance DESC, name ASC
    `).all();

    return countries;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching countries:', err.message);
    return [];
  }
}

/**
 * Get top N countries by importance/priority
 * @param {import('better-sqlite3').Database} db
 * @param {number} limit - Maximum number of countries to return
 * @returns {Array<{name: string, code: string, importance: number, population: number, wikidataQid: string}>}
 */
function getTopCountries(db, limit = 50) {
  try {
    const countries = db.prepare(`
      WITH country_names AS (
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
          p.wikidata_qid AS wikidataQid,
          COALESCE(p.population, 0) AS population
        FROM places p
        WHERE p.kind = 'country'
          AND p.country_code IS NOT NULL
      )
      SELECT name, code, importance, wikidataQid, population
      FROM country_names
      WHERE name IS NOT NULL
      ORDER BY importance DESC, name ASC
      LIMIT ?
    `).all(limit);

    return countries;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching top countries:', err.message);
    return [];
  }
}

/**
 * Get top N regions by importance.
 *
 * Regions cover first-level administrative divisions (ADM1) such as states or provinces.
 *
 * @param {import('better-sqlite3').Database} db - Database connection.
 * @param {number} [limit=50] - Maximum number of regions to return.
 * @returns {Array<{id: number, name: string, code: string|null, countryCode: string|null, importance: number}>}
 */
function getTopRegions(db, limit = 50) {
  try {
    const regions = db.prepare(`
      WITH region_names AS (
        SELECT
          p.id,
          p.adm1_code AS code,
          p.country_code AS countryCode,
          COALESCE(
            (SELECT name FROM place_names WHERE id = p.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = p.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name,
          COALESCE(p.priority_score, p.population, 0) AS importance
        FROM places p
        WHERE p.kind = 'region'
      )
      SELECT id, name, code, countryCode, importance
      FROM region_names
      WHERE name IS NOT NULL
      ORDER BY importance DESC, name ASC
      LIMIT ?
    `).all(limit);

    return regions;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching regions:', err.message);
    return [];
  }
}

/**
 * Get top N cities by importance, including their parent region when available.
 *
 * @param {import('better-sqlite3').Database} db - Database connection.
 * @param {number} [limit=50] - Maximum number of cities to return.
 * @returns {Array<{id: number, name: string, countryCode: string|null, regionName: string|null, regionId: number|null, importance: number}>}
 */
function getTopCities(db, limit = 50) {
  try {
    const cities = db.prepare(`
      WITH direct_parent AS (
        SELECT child_id, MIN(parent_id) AS parent_id
          FROM place_hierarchy
         WHERE depth IS NULL OR depth = 1
         GROUP BY child_id
      ),
      city_names AS (
        SELECT
          city.id,
          COALESCE(
            (SELECT name FROM place_names WHERE id = city.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = city.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name,
          city.country_code AS countryCode,
          COALESCE(city.priority_score, city.population, 0) AS importance,
          dp.parent_id AS regionId
        FROM places city
        LEFT JOIN direct_parent dp ON dp.child_id = city.id
        WHERE city.kind = 'city'
      ),
      region_names AS (
        SELECT
          region.id,
          COALESCE(
            (SELECT name FROM place_names WHERE id = region.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = region.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name
        FROM places region
        WHERE region.kind IN ('region', 'country')
      )
      SELECT 
        cn.id,
        cn.name,
        cn.countryCode,
        cn.regionId,
        rn.name AS regionName,
        cn.importance
      FROM city_names cn
      LEFT JOIN region_names rn ON rn.id = cn.regionId
      WHERE cn.name IS NOT NULL
      ORDER BY cn.importance DESC, cn.name ASC
      LIMIT ?
    `).all(limit);

    return cities;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching cities:', err.message);
    return [];
  }
}

/**
 * Get country by name
 * @param {import('better-sqlite3').Database} db
 * @param {string} name - Country name to search for
 * @returns {Object|null} Country object or null if not found
 */
function getCountryByName(db, name) {
  try {
    const country = db.prepare(`
      SELECT 
        pn.name,
        p.country_code as code,
        COALESCE(p.priority_score, 0) as importance,
        p.wikidata_qid as wikidataQid,
        COALESCE(p.population, 0) as population
      FROM places p
      LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
      WHERE p.kind = 'country'
        AND pn.name = ?
        AND p.country_code IS NOT NULL
      LIMIT 1
    `).get(name);

    return country || null;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching country by name:', err.message);
    return null;
  }
}

/**
 * Get country by code
 * @param {import('better-sqlite3').Database} db
 * @param {string} code - Country code (ISO 3166-1 alpha-2)
 * @returns {Object|null} Country object or null if not found
 */
function getCountryByCode(db, code) {
  try {
    const country = db.prepare(`
      SELECT 
        pn.name,
        p.country_code as code,
        COALESCE(p.priority_score, 0) as importance,
        p.wikidata_qid as wikidataQid,
        COALESCE(p.population, 0) as population
      FROM places p
      LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
      WHERE p.kind = 'country'
        AND p.country_code = ?
      LIMIT 1
    `).get(code);

    return country || null;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching country by code:', err.message);
    return null;
  }
}

/**
 * Get count of places by kind
 * @param {import('better-sqlite3').Database} db
 * @param {string} kind - Place kind (country, region, city, etc.)
 * @returns {number} Count of places
 */
function getPlaceCountByKind(db, kind) {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM places
      WHERE kind = ?
        AND status = 'current'
    `).get(kind);

    return result?.count || 0;
  } catch (err) {
    console.error('[gazetteer.places] Error counting places:', err.message);
    return 0;
  }
}

module.exports = {
  getAllCountries,
  getTopCountries,
  getTopRegions,
  getTopCities,
  getCountryByName,
  getCountryByCode,
  getPlaceCountByKind
};
