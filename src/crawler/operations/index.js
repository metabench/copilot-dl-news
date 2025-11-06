'use strict';

const { CrawlOperation, cloneOptions } = require('./CrawlOperation');
const { EnsureCountryHubsOperation } = require('./EnsureCountryHubsOperation');
const { ExploreCountryHubsOperation } = require('./ExploreCountryHubsOperation');
const { CrawlCountryHubHistoryOperation } = require('./CrawlCountryHubHistoryOperation');
const { CrawlCountryHubsHistoryOperation } = require('./CrawlCountryHubsHistoryOperation');
const { FindTopicHubsOperation } = require('./FindTopicHubsOperation');
const { FindPlaceAndTopicHubsOperation } = require('./FindPlaceAndTopicHubsOperation');
const { CustomCrawlOperation } = require('./CustomCrawlOperation');
const { CrawlSequenceRunner } = require('./SequenceRunner');
const {
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
} = require('./sequencePresets');

const createDefaultOperations = () => (
  [
    new EnsureCountryHubsOperation(),
    new ExploreCountryHubsOperation(),
    new CrawlCountryHubHistoryOperation(),
    new CrawlCountryHubsHistoryOperation(),
    new FindTopicHubsOperation(),
    new FindPlaceAndTopicHubsOperation()
  ]
);

module.exports = {
  CrawlOperation,
  cloneOptions,
  CustomCrawlOperation,
  createDefaultOperations,
  CrawlSequenceRunner,
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
};
