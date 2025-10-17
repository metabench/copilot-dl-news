const { slugify } = require('../../../src/tools/slugify');

function normalizedText(value) {
  if (!value) return null;
  return value
    .toString()
    .trim()
    .toLowerCase();
}

class CountryMetadata {
  constructor({ countries, nameRows }) {
    this.byId = new Map();
    this.byCode = new Map();
    this.bySlug = new Map();
    this.byName = new Map();
    this.nameSet = new Set();

    for (const row of countries) {
      if (!row.name) continue;
      const name = row.name.trim();
      const slug = slugify(name);
      const country = {
        id: row.id,
        name,
        slug,
        code: row.code ? row.code.trim() : null,
        importance: row.importance || 0
      };
      this.byId.set(row.id, country);
      if (country.code) {
        this.byCode.set(country.code.toLowerCase(), country);
      }
      if (slug) {
        this.bySlug.set(slug.toLowerCase(), country);
      }
      const lower = normalizedText(name);
      if (lower) {
        this.byName.set(lower, country);
        this.nameSet.add(lower);
      }
    }

    for (const row of nameRows) {
      const country = this.byId.get(row.place_id);
      if (!country) continue;
      const name = row.name?.trim();
      if (!name) continue;
      const lower = normalizedText(name);
      if (!lower) continue;
      this.byName.set(lower, country);
      this.nameSet.add(lower);
      const slug = slugify(name);
      if (slug) {
        this.bySlug.set(slug.toLowerCase(), country);
      }
      if (row.normalized) {
        const norm = row.normalized.trim().toLowerCase();
        if (norm) {
          this.byName.set(norm, country);
          this.nameSet.add(norm);
        }
      }
    }
  }

  matchSegment(segment) {
    const lower = normalizedText(segment);
    if (!lower) return null;
    if (this.bySlug.has(lower)) return this.bySlug.get(lower);
    if (this.byName.has(lower)) return this.byName.get(lower);
    if (this.byCode.has(lower)) return this.byCode.get(lower);
    return null;
  }

  matchInText(text) {
    const value = text?.toString();
    if (!value) return null;
    const lower = value.toLowerCase();
    for (const [code, country] of this.byCode.entries()) {
      const regex = new RegExp(`\\b${escapeRegex(code)}\\b`, 'i');
      if (regex.test(lower)) {
        return country;
      }
    }
    for (const [name, country] of this.byName.entries()) {
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
      if (regex.test(lower)) {
        return country;
      }
    }
    return null;
  }

  getBySlug(slug) {
    if (!slug) return null;
    return this.bySlug.get(slug.toLowerCase()) || null;
  }

  getByCode(code) {
    if (!code) return null;
    return this.byCode.get(code.toLowerCase()) || null;
  }

  get nameCount() {
    return this.nameSet.size;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadCountryMetadata(db) {
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
        COALESCE(p.priority_score, p.population, 0) AS importance
      FROM places p
      WHERE p.kind = 'country'
        AND p.status = 'current'
        AND p.country_code IS NOT NULL
    )
    SELECT id, name, code, importance
    FROM country_names
    WHERE name IS NOT NULL
  `).all();

  const nameRows = db.prepare(`
    SELECT pn.place_id, pn.name, pn.normalized
    FROM place_names pn
    JOIN places p ON pn.place_id = p.id
    WHERE p.kind = 'country'
  `).all();

  return new CountryMetadata({ countries, nameRows });
}

function loadRegionMetadata(db) {
  const rows = db.prepare(`
    WITH region_names AS (
      SELECT
        p.id,
        COALESCE(
          (SELECT name FROM place_names WHERE id = p.canonical_name_id),
          (SELECT name FROM place_names
             WHERE place_id = p.id
             ORDER BY is_preferred DESC, (lang = 'en') DESC, id ASC
             LIMIT 1)
        ) AS name,
        p.country_code AS countryCode,
        p.adm1_code AS regionCode
      FROM places p
      WHERE p.kind = 'region'
        AND p.status = 'current'
    )
    SELECT id, name, countryCode, regionCode
    FROM region_names
    WHERE name IS NOT NULL
  `).all();

  const index = new Map();
  for (const row of rows) {
    const name = row.name.trim();
    const slug = slugify(name);
    if (!slug) continue;
    index.set(slug.toLowerCase(), {
      id: row.id,
      name,
      slug,
      countryCode: row.countryCode ? row.countryCode.toLowerCase() : null,
      regionCode: row.regionCode ? row.regionCode.toLowerCase() : null
    });
  }
  return index;
}

function loadCityMetadata(db) {
  const rows = db.prepare(`
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
        dp.parent_id AS regionId
      FROM places city
      LEFT JOIN direct_parent dp ON dp.child_id = city.id
      WHERE city.kind = 'city'
        AND city.status = 'current'
    ),
    region_codes AS (
      SELECT
        region.id,
        region.adm1_code AS regionCode
      FROM places region
      WHERE region.kind = 'region'
    )
    SELECT cn.id, cn.name, cn.countryCode, cn.regionId, rc.regionCode
    FROM city_names cn
    LEFT JOIN region_codes rc ON rc.id = cn.regionId
    WHERE cn.name IS NOT NULL
  `).all();

  const index = new Map();
  for (const row of rows) {
    const name = row.name.trim();
    const slug = slugify(name);
    if (!slug) continue;
    index.set(slug.toLowerCase(), {
      id: row.id,
      name,
      slug,
      countryCode: row.countryCode ? row.countryCode.toLowerCase() : null,
      regionCode: row.regionCode ? row.regionCode.toLowerCase() : null
    });
  }
  return index;
}

function loadPlaceMetadata(db) {
  const countries = loadCountryMetadata(db);
  const regions = loadRegionMetadata(db);
  const cities = loadCityMetadata(db);
  return { countries, regions, cities };
}

module.exports = {
  CountryMetadata,
  loadCountryMetadata,
  loadRegionMetadata,
  loadCityMetadata,
  loadPlaceMetadata
};
