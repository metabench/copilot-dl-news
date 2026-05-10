'use strict';

const {
  getTopicTermsForLanguage,
  getAllTopicsGrouped,
  isTopicKeyword,
  getTopicForTerm,
  seedDefaultTopics,
  normalizeTopicKeywordTerm
} = require('news-crawler-db');

module.exports = {
  getTopicTermsForLanguage,
  getAllTopicsGrouped,
  isTopicKeyword,
  getTopicForTerm,
  seedDefaultTopics,
  normalizeTerm: normalizeTopicKeywordTerm
};
