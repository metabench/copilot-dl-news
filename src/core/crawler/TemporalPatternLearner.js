'use strict';

const { TemporalPatternLearner: DbTemporalPatternLearner } = require('news-crawler-db');
const { getDb } = require('../../db');

class TemporalPatternLearner extends DbTemporalPatternLearner {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { TemporalPatternLearner };
