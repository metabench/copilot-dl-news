'use strict';

const {
  validateGazetteerIntegrity,
  repairGazetteerIntegrity
} = require('news-crawler-db');

module.exports = {
  validateGazetteer: validateGazetteerIntegrity,
  repairGazetteer: repairGazetteerIntegrity
};
