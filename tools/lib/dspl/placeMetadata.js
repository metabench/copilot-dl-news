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

function getDsplAnalysis(db) {
  if (!db || !db.dsplAnalysis) {
    throw new Error('news-crawler-db dsplAnalysis access is unavailable');
  }
  return db.dsplAnalysis;
}

function loadCountryMetadata(db) {
  const access = getDsplAnalysis(db);
  const countries = access.listDsplCountryMetadataRows();
  const nameRows = access.listDsplCountryNameRows();

  return new CountryMetadata({ countries, nameRows });
}

function loadRegionMetadata(db) {
  const rows = getDsplAnalysis(db).listDsplRegionMetadataRows();

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
  const rows = getDsplAnalysis(db).listDsplCityMetadataRows();

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
