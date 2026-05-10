'use strict';

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
