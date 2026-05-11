'use strict';

const {
  clampInt,
  normalizeLang,
  normalizeSearchQuery,
  buildTopicHubMatrixModel,
  selectTopicHubCellRows,
  selectTopicHubHosts
} = require('news-crawler-db');

module.exports = {
  clampInt,
  normalizeLang,
  normalizeSearchQuery,
  buildMatrixModel: buildTopicHubMatrixModel,
  selectCellRows: selectTopicHubCellRows,
  selectTopicHubHosts
};
