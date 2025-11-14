'use strict';

const { CrawlOperation, cloneOptions } = require('./CrawlOperation');
const { EnsureCountryHubsOperation } = require('./EnsureCountryHubsOperation');
const { ExploreCountryHubsOperation } = require('./ExploreCountryHubsOperation');
const { CrawlCountryHubHistoryOperation } = require('./CrawlCountryHubHistoryOperation');
const { CrawlCountryHubsHistoryOperation } = require('./CrawlCountryHubsHistoryOperation');
const { FindTopicHubsOperation } = require('./FindTopicHubsOperation');
const { FindPlaceAndTopicHubsOperation } = require('./FindPlaceAndTopicHubsOperation');
const { GuessPlaceHubsOperation } = require('./GuessPlaceHubsOperation');
const { BasicArticleCrawlOperation } = require('./BasicArticleCrawlOperation');
const { CustomCrawlOperation } = require('./CustomCrawlOperation');
const { CrawlSequenceRunner } = require('./SequenceRunner');
const {
  listSequencePresets,
  getSequencePreset,
  resolveSequencePreset
} = require('./sequencePresets');

const createDefaultOperations = () => (
  [
    new BasicArticleCrawlOperation(),
    new EnsureCountryHubsOperation(),
    new ExploreCountryHubsOperation(),
    new CrawlCountryHubHistoryOperation(),
    new CrawlCountryHubsHistoryOperation(),
    new FindTopicHubsOperation(),
    new FindPlaceAndTopicHubsOperation(),
    new GuessPlaceHubsOperation()
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
