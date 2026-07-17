'use strict';
// Old-layer compatibility shim. Previously re-required the (now retired)
// v1/queries/gazetteer.places shim; named re-exports from news-crawler-db
// keep the historical surface. Remaining importers: tools/manual-tests/
// test-gazetteer-queries.js, tools/crawl/intelligent-crawl.js — repoint
// them and delete this file in the old-layer sweep.
const {
  getAllCountries,
  getTopCountries,
  getTopRegions,
  getTopCities,
  getCountryByName,
  getCountryByCode,
  getPlaceCountByKind,
  getPlacesByCountryAndKind,
  getPlaceHierarchy,
  getPlaceNameVariantsForHubDiscovery,
  getPlaceNamesByLanguages,
  getAllCountriesWithNameVariants,
  getTopCitiesPerCountry
} = require('news-crawler-db');

module.exports = {
  getAllCountries,
  getTopCountries,
  getTopRegions,
  getTopCities,
  getCountryByName,
  getCountryByCode,
  getPlaceCountByKind,
  getPlacesByCountryAndKind,
  getPlaceHierarchy,
  getPlaceNameVariantsForHubDiscovery,
  getPlaceNamesByLanguages,
  getAllCountriesWithNameVariants,
  getTopCitiesPerCountry
};
