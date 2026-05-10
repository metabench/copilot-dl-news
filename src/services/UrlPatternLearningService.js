'use strict';

const { UrlPatternLearningService: DbUrlPatternLearningService } = require('news-crawler-db');
const { getDb } = require('../data/db');

class UrlPatternLearningService extends DbUrlPatternLearningService {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { UrlPatternLearningService };
