'use strict';

const { ensurePostgresV1Db } = require('news-crawler-db');

module.exports = {
  ensureDb: ensurePostgresV1Db
};
