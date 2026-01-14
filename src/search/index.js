'use strict';

/**
 * Search Module - Full-Text Search for Articles
 * 
 * Exports:
 *   - SearchService: High-level search API
 *   - createSearchAdapter: Low-level database adapter
 */

const { SearchService } = require('./SearchService');
const { createSearchAdapter, BM25_WEIGHTS, sanitizeFtsQuery } = require('../data/db/sqlite/v1/queries/searchAdapter');

module.exports = {
  SearchService,
  createSearchAdapter,
  BM25_WEIGHTS,
  sanitizeFtsQuery
};
