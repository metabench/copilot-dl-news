'use strict';

const {
  getCountryHubCandidates,
  normalizePlaceHubCandidateHost
} = require('news-crawler-db');

module.exports = {
  getCountryHubCandidates,
  normalizeHost: normalizePlaceHubCandidateHost
};
