'use strict';

const { UrlClassificationService: DbUrlClassificationService } = require('news-crawler-db');
const { getDb } = require('../data/db');

class UrlClassificationService extends DbUrlClassificationService {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { UrlClassificationService };
