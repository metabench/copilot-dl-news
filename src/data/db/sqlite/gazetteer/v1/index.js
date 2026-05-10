'use strict';

const {
  GazetteerDatabase,
  createGazetteerDatabase,
  openGazetteerReadOnly,
  wrapWithGazetteer,
  getDefaultGazetteerPath,
  initializeGazetteerSchema,
  checkGazetteerSchema,
  getGazetteerStats,
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS,
  GAZETTEER_TARGETS
} = require('news-crawler-db');

module.exports = {
  GazetteerDatabase,
  createGazetteerDatabase,
  openGazetteerReadOnly,
  wrapWithGazetteer,
  getDefaultGazetteerPath,
  initializeGazetteerSchema,
  checkGazetteerSchema,
  getGazetteerStats,
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS,
  GAZETTEER_TARGETS
};
