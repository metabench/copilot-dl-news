'use strict';

const {
  createMultiLanguagePlaceQueries,
  MULTI_LANGUAGE_PLACE_DEFAULT_LANGUAGES,
  MULTI_LANGUAGE_PLACE_LANGUAGE_FAMILIES
} = require('news-crawler-db');

module.exports = {
  createMultiLanguagePlaceQueries,
  DEFAULT_LANGUAGES: MULTI_LANGUAGE_PLACE_DEFAULT_LANGUAGES,
  LANGUAGE_FAMILIES: MULTI_LANGUAGE_PLACE_LANGUAGE_FAMILIES
};
