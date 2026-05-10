'use strict';

const {
  initializeSqliteV1Schema,
  initSqliteV1CoreTables,
  initSqliteV1GazetteerTables,
  initSqliteV1PlaceHubsTables,
  initSqliteV1CompressionTables,
  initSqliteV1BackgroundTasksTables,
  initSqliteV1Views
} = require('news-crawler-db');

module.exports = {
  initializeSchema: initializeSqliteV1Schema,
  initCoreTables: initSqliteV1CoreTables,
  initGazetteerTables: initSqliteV1GazetteerTables,
  initPlaceHubsTables: initSqliteV1PlaceHubsTables,
  initCompressionTables: initSqliteV1CompressionTables,
  initBackgroundTasksTables: initSqliteV1BackgroundTasksTables,
  initViews: initSqliteV1Views
};
