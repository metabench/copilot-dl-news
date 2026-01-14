const { getPlaceDetails, searchPlacesByName } = require('../../../../data/db/sqlite/v1/queries/gazetteer.search');

class PlaceService {
  constructor(db) {
    this.db = db;
  }

  search(term, options = {}) {
    return searchPlacesByName(this.db, term, { limit: 50, ...options });
  }

  getPlace(id) {
    const rawData = getPlaceDetails(this.db, id);
    if (!rawData) return null;

    return this.formatPlaceData(rawData);
  }

  formatPlaceData(data) {
    // Group names by kind
    const namesByKind = data.names.reduce((acc, name) => {
      const kind = name.name_kind || 'other';
      if (!acc[kind]) acc[kind] = [];
      acc[kind].push(name);
      return acc;
    }, {});

    // Group attributes by source
    const attributesBySource = data.attributes.reduce((acc, attr) => {
      const source = attr.source || 'unknown';
      if (!acc[source]) acc[source] = [];
      acc[source].push(attr);
      return acc;
    }, {});

    return {
      info: {
        id: data.id,
        name: data.name,
        kind: data.kind,
        countryCode: data.country_code,
        population: data.population,
        lat: data.lat,
        lng: data.lng,
        wikidataQid: data.wikidata_qid,
        status: data.status
      },
      names: namesByKind,
      hierarchy: {
        parents: data.parents,
        children: data.children
      },
      attributes: attributesBySource,
      raw: data // Keep raw data just in case
    };
  }
}

module.exports = PlaceService;
