'use strict';

const {
  normalizeNonGeoTopicSlugLang,
  normalizeNonGeoTopicSlugSearchQuery,
  clampNonGeoTopicSlugInt,
  selectTopicLanguages,
  selectTopicSlugRows,
  upsertTopicSlugRow,
  deleteTopicSlugRow,
  selectTopicSlugsForMatrix
} = require('news-crawler-db');

module.exports = {
  normalizeLang: normalizeNonGeoTopicSlugLang,
  normalizeSearchQuery: normalizeNonGeoTopicSlugSearchQuery,
  clampInt: clampNonGeoTopicSlugInt,
  selectTopicLanguages,
  selectTopicSlugRows,
  upsertTopicSlugRow,
  deleteTopicSlugRow,
  selectTopicSlugsForMatrix
};
