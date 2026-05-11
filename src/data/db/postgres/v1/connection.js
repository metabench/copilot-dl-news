'use strict';

const { createPostgresPool } = require('news-crawler-db');

module.exports = {
  createPool: createPostgresPool
};
