'use strict';

const { CrawlPlaybookService: DbCrawlPlaybookService } = require('news-crawler-db');
const { getDb } = require('../../db');

class CrawlPlaybookService extends DbCrawlPlaybookService {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { CrawlPlaybookService };
