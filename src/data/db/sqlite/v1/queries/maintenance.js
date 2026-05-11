'use strict';

const {
  vacuumDatabase,
  getDatabaseSize,
  dropLegacyTables
} = require('news-crawler-db');

module.exports = {
  vacuumDatabase,
  getDatabaseSize,
  dropLegacyTables
};
