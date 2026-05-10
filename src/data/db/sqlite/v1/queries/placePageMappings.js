'use strict';

const {
  getCountryHubCoverage,
  getPlacePlaceHubCoverage,
  markPlacePageMappingVerified,
  upsertPlacePageMapping,
  upsertAbsentPlacePageMapping,
  getVerifiedHubsForArchive,
  updateHubDepthCheck,
  getArchiveCrawlStats,
  getHubsNeedingArchive
} = require('news-crawler-db');

module.exports = {
  getCountryHubCoverage,
  getPlacePlaceHubCoverage,
  markPlacePageMappingVerified,
  upsertPlacePageMapping,
  upsertAbsentPlacePageMapping,
  getVerifiedHubsForArchive,
  updateHubDepthCheck,
  getArchiveCrawlStats,
  getHubsNeedingArchive
};
