'use strict';

const {
  getUiGazetteerCountryByCode,
  getUiGazetteerRegionCount,
  listUiGazetteerRegions,
  getUiGazetteerCityCount,
  listUiGazetteerCities,
  getUiGazetteerRegionAndCityCounts,
  listUiGazetteerTopCities,
  createUiGazetteerCountryPlaceSizeCalculator
} = require('news-crawler-db');

module.exports = {
  getCountryByCode: getUiGazetteerCountryByCode,
  getRegionCount: getUiGazetteerRegionCount,
  listRegions: listUiGazetteerRegions,
  getCityCount: getUiGazetteerCityCount,
  listCities: listUiGazetteerCities,
  getRegionAndCityCounts: getUiGazetteerRegionAndCityCounts,
  listTopCities: listUiGazetteerTopCities,
  createPlaceSizeCalculator: createUiGazetteerCountryPlaceSizeCalculator
};
