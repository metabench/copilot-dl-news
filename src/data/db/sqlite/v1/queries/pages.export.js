'use strict';

const {
  pagesExportTableExists,
  getTableCount,
  getQueryCount,
  getTotalArticlesCount,
  getArticlesQuery,
  getArticlesChunk,
  insertCompressionType,
  getLastInsertRowid,
  insertArticle,
  getExportedArticlesCount,
  getExtractionStats,
  getCompressionStats
} = require('news-crawler-db');

module.exports = {
  tableExists: pagesExportTableExists,
  getTableCount,
  getQueryCount,
  getTotalArticlesCount,
  getArticlesQuery,
  getArticlesChunk,
  insertCompressionType,
  getLastInsertRowid,
  insertArticle,
  getExportedArticlesCount,
  getExtractionStats,
  getCompressionStats
};
