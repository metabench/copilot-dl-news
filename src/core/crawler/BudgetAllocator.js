'use strict';

const { BudgetAllocator: DbBudgetAllocator } = require('news-crawler-db');
const { getDb } = require('../../data/db');

class BudgetAllocator extends DbBudgetAllocator {
  constructor(options = {}) {
    const resolved = { ...options };
    if (!resolved.db) {
      resolved.db = getDb();
    }
    super(resolved);
  }
}

module.exports = { BudgetAllocator };
