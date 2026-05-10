'use strict';

const {
  getUiGazetteerPlaceById,
  listUiGazetteerPlaceNames,
  listUiGazetteerExternalIds,
  listUiGazetteerParentPlaces,
  listUiGazetteerChildPlaces,
  getUiGazetteerCanonicalName,
  createUiGazetteerPlaceSizeCalculator,
  listUiGazetteerPlaceArticles
} = require('news-crawler-db');

module.exports = {
  getPlaceById: getUiGazetteerPlaceById,
  listPlaceNames: listUiGazetteerPlaceNames,
  listExternalIds: listUiGazetteerExternalIds,
  listParentPlaces: listUiGazetteerParentPlaces,
  listChildPlaces: listUiGazetteerChildPlaces,
  getCanonicalName: getUiGazetteerCanonicalName,
  createPlaceSizeCalculator: createUiGazetteerPlaceSizeCalculator,
  listPlaceArticles: listUiGazetteerPlaceArticles
};
