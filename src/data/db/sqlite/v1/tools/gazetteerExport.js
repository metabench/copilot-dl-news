"use strict";

const {
  iterateGazetteerTableRows,
  iteratePlaceSources,
  iteratePlaces,
  iteratePlaceNames,
  iteratePlaceHierarchy,
  iteratePlaceExternalIds
} = require("news-crawler-db");

module.exports = {
  iteratePlaceSources,
  iteratePlaces,
  iteratePlaceNames,
  iteratePlaceHierarchy,
  iteratePlaceExternalIds,
  safeIterateAll: iterateGazetteerTableRows
};
