/**
 * Gazetteer places query functions
 *
 * Database access layer for querying places table with normalized access patterns.
 * Used by planning services, gap analysis tools, and hub discovery utilities.
 */

/**
 * Get all countries from gazetteer with their preferred names
 * @param {import('better-sqlite3').Database} db
 * @param {string} [lang='en'] - Preferred language code (BCP-47)
 * @returns {Array<{id: number, name: string, code: string, importance: number, population: number, wikidataQid: string}>}
 */
function getAllCountries(db, lang = 'en') {
  try {
    const countries = db.prepare(`
      WITH country_names AS (
        SELECT
          p.id,
          p.country_code AS code,
          COALESCE(
            (SELECT name FROM place_names 
             WHERE place_id = p.id 
             ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
             LIMIT 1),
            (SELECT name FROM place_names WHERE id = p.canonical_name_id)
          ) AS name,
          COALESCE(p.priority_score, p.population, 0) AS importance,
          p.wikidata_qid AS wikidataQid,
          COALESCE(p.population, 0) AS population
        FROM places p
        WHERE p.kind = 'country'
          AND p.country_code IS NOT NULL
      )
      SELECT id, name, code, importance, wikidataQid, population
      FROM country_names
      WHERE name IS NOT NULL
      ORDER BY importance DESC, name ASC
    `).all(lang);

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
 * @param {string} [lang='en'] - Preferred language code (BCP-47)
 * @returns {Array<{id: number, name: string, code: string, importance: number, population: number, wikidataQid: string}>}
 */
function getTopCountries(db, limit = 50, lang = 'en') {
  try {
    const countries = db.prepare(`
      WITH country_names AS (
        SELECT
          p.id,
          p.country_code AS code,
          COALESCE(
            (SELECT name FROM place_names 
             WHERE place_id = p.id 
             ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
             LIMIT 1),
            (SELECT name FROM place_names WHERE id = p.canonical_name_id)
          ) AS name,
          COALESCE(p.priority_score, p.population, 0) AS importance,
          p.wikidata_qid AS wikidataQid,
          COALESCE(p.population, 0) AS population
        FROM places p
        WHERE p.kind = 'country'
          AND p.country_code IS NOT NULL
      )
      SELECT id, name, code, importance, wikidataQid, population
      FROM country_names
      WHERE name IS NOT NULL
      ORDER BY importance DESC, name ASC
      LIMIT ?
    `).all(lang, limit);

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
 * @param {string} [lang='en'] - Preferred language code (BCP-47)
 * @returns {Array<{id: number, name: string, code: string|null, countryCode: string|null, importance: number}>}
 */
function getTopRegions(db, limit = 50, lang = 'en') {
  try {
    const regions = db.prepare(`
      WITH region_names AS (
        SELECT
          p.id,
          p.adm1_code AS code,
          p.country_code AS countryCode,
          COALESCE(
            (SELECT name FROM place_names 
             WHERE place_id = p.id 
             ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
             LIMIT 1),
            (SELECT name FROM place_names WHERE id = p.canonical_name_id)
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
    `).all(lang, limit);

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
 * @param {string} [lang='en'] - Preferred language code (BCP-47)
 * @returns {Array<{id: number, name: string, countryCode: string|null, regionName: string|null, regionId: number|null, importance: number}>}
 */
function getTopCities(db, limit = 50, lang = 'en') {
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
            (SELECT name FROM place_names 
             WHERE place_id = city.id 
             ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
             LIMIT 1),
            (SELECT name FROM place_names WHERE id = city.canonical_name_id)
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
            (SELECT name FROM place_names 
             WHERE place_id = region.id 
             ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
             LIMIT 1),
            (SELECT name FROM place_names WHERE id = region.canonical_name_id)
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
    `).all(lang, lang, limit);

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

/**
 * Get places by country code and kind
 * @param {import('better-sqlite3').Database} db
 * @param {string} countryCode - ISO country code
 * @param {string} kind - Place kind (region, city, etc.)
 * @param {string} [lang='en'] - Preferred language code (BCP-47)
 * @returns {Array} Array of place objects
 */
function getPlacesByCountryAndKind(db, countryCode, kind, lang = 'en') {
  try {
    const places = db.prepare(`
      SELECT
        p.id,
        p.kind,
        p.country_code,
        p.adm1_code,
        COALESCE(p.population, 0) AS population,
        COALESCE(p.priority_score, p.population, 0) AS importance,
        COALESCE(
          (SELECT name FROM place_names 
           WHERE place_id = p.id 
           ORDER BY (lang = ?) DESC, is_preferred DESC, (lang = 'en') DESC, id ASC 
           LIMIT 1),
          (SELECT name FROM place_names WHERE id = p.canonical_name_id)
        ) AS name
      FROM places p
      WHERE p.country_code = ?
        AND p.kind = ?
        AND COALESCE(p.status, 'current') = 'current'
      ORDER BY population DESC, name ASC
    `).all(lang, countryCode, kind);

    return places;
  } catch (err) {
    console.error('[gazetteer.places] Error fetching places by country and kind:', err.message);
    return [];
  }
}

/**
 * Get hierarchical place relationships (parent-child)
 * @param {import('better-sqlite3').Database} db
 * @returns {Array} Array of hierarchy objects with parent and child data
 */
function getPlaceHierarchy(db) {
  try {
    const hierarchies = db.prepare(`
      WITH direct_parent AS (
        SELECT child_id, MIN(parent_id) AS parent_id
          FROM place_hierarchy
         WHERE depth IS NULL OR depth = 1
         GROUP BY child_id
      ),
      parent_places AS (
        SELECT
          p.id,
          p.kind,
          p.country_code,
        COALESCE(p.population, 0) AS population,
        COALESCE(p.priority_score, p.population, 0) AS importance,
          COALESCE(
            (SELECT name FROM place_names WHERE id = p.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = p.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name
        FROM places p
        WHERE COALESCE(p.status, 'current') = 'current'
      ),
      child_places AS (
        SELECT
          p.id,
          p.kind,
          p.country_code,
          COALESCE(p.population, 0) AS population,
          COALESCE(p.priority_score, p.population, 0) AS importance,
          COALESCE(
            (SELECT name FROM place_names WHERE id = p.canonical_name_id),
            (SELECT name FROM place_names
               WHERE place_id = p.id
               ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
               LIMIT 1)
          ) AS name
        FROM places p
        WHERE COALESCE(p.status, 'current') = 'current'
      )
      SELECT
        pp.id AS parent_id,
        pp.name AS parent_name,
        pp.kind AS parent_kind,
        pp.country_code AS parent_country_code,
        pp.population AS parent_population,
        pp.importance AS parent_importance,
        cp.id AS child_id,
        cp.name AS child_name,
        cp.kind AS child_kind,
        cp.country_code AS child_country_code,
        cp.population AS child_population,
        cp.importance AS child_importance
      FROM direct_parent dp
      JOIN parent_places pp ON pp.id = dp.parent_id
      JOIN child_places cp ON cp.id = dp.child_id
      WHERE pp.name IS NOT NULL AND cp.name IS NOT NULL
      ORDER BY (pp.population + cp.population) DESC
    `).all();

    // Transform into hierarchy objects
    return hierarchies.map(row => ({
      parent: {
        id: row.parent_id,
        name: row.parent_name,
        kind: row.parent_kind,
        country_code: row.parent_country_code,
        population: row.parent_population,
        importance: row.parent_importance
      },
      child: {
        id: row.child_id,
        name: row.child_name,
        kind: row.child_kind,
        country_code: row.child_country_code,
        population: row.child_population,
        importance: row.child_importance
      }
    }));
  } catch (err) {
    console.error('[gazetteer.places] Error fetching place hierarchy:', err.message);
    return [];
  }
}

module.exports = {
  getAllCountries,
  getTopCountries,
  getTopRegions,
  getTopCities,
  getCountryByName,
  getCountryByCode,
  getPlaceCountByKind,
  getPlacesByCountryAndKind,
  getPlaceHierarchy
};
