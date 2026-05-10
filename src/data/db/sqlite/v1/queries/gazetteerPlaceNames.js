'use strict';

const {
  getAllPlaceNames,
  findPlacesByNormalized,
  upsertAliasMapping,
  findPlaceByAlias,
  getAllAliasMappings,
  toUrlSlug
} = require('news-crawler-db');

module.exports = {
  getAllPlaceNames,
  findPlacesByNormalized,
  upsertAliasMapping,
  findPlaceByAlias,
  getAllAliasMappings,
  toUrlSlug
};
