'use strict';

const {
  findTablesWithCompression,
  getTableRecordCount,
  getCompressionUsageStats
} = require('news-crawler-db');

module.exports = {
  findTablesWithCompression,
  getTableRecordCount,
  getCompressionStats: getCompressionUsageStats
};
