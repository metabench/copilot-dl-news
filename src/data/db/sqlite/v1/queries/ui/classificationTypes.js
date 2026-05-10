'use strict';

const {
  listClassificationTypes,
  getClassificationById,
  getClassificationByName,
  listClassificationsWithCounts,
  getDocumentsForClassification,
  countDocumentsForClassification,
  getRandomDocumentsForClassification
} = require('news-crawler-db');

module.exports = {
  listClassificationTypes,
  getClassificationById,
  getClassificationByName,
  listClassificationsWithCounts,
  getDocumentsForClassification,
  countDocumentsForClassification,
  getRandomDocumentsForClassification
};
