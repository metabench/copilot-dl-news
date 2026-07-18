'use strict';

const { PredictiveHubDiscovery: DbPredictiveHubDiscovery } = require('news-crawler-db');
const { getDb } = require('../../db');

class PredictiveHubDiscovery extends DbPredictiveHubDiscovery {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { PredictiveHubDiscovery };
