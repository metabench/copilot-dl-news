'use strict';

const {
  createClassicGazetteerDeduplicationStatements,
  checkClassicGazetteerIngestionRun,
  startClassicGazetteerIngestionRun,
  completeClassicGazetteerIngestionRun,
  findExistingClassicGazetteerPlace,
  generateClassicGazetteerCapitalExternalId,
  addClassicGazetteerCapitalRelationship
} = require('news-crawler-db');

module.exports = {
  createDeduplicationStatements: createClassicGazetteerDeduplicationStatements,
  checkIngestionRun: checkClassicGazetteerIngestionRun,
  startIngestionRun: startClassicGazetteerIngestionRun,
  completeIngestionRun: completeClassicGazetteerIngestionRun,
  findExistingPlace: findExistingClassicGazetteerPlace,
  generateCapitalExternalId: generateClassicGazetteerCapitalExternalId,
  addCapitalRelationship: addClassicGazetteerCapitalRelationship
};
