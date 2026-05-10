'use strict';

const {
  getSkipTermsForLanguage,
  getSkipTermsByReason,
  shouldSkipTerm,
  getSkipReason,
  seedDefaultSkipTerms,
  normalizeCrawlSkipTerm
} = require('news-crawler-db');

module.exports = {
  getSkipTermsForLanguage,
  getSkipTermsByReason,
  shouldSkipTerm,
  getSkipReason,
  seedDefaultSkipTerms,
  normalizeTerm: normalizeCrawlSkipTerm
};
