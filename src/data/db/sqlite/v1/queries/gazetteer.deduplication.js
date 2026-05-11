'use strict';

const {
  createDeduplicationStatements,
  findExistingPlace,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  failIngestionRun,
  addCapitalRelationship,
  getCapitalCountries,
  generateCapitalExternalId,
  mergeDuplicatePlaces,
  mergeDuplicateCapitals,
  countPlacesForDuplicateCorrection,
  countCapitalCitiesForDuplicateCorrection
} = require('news-crawler-db');

module.exports = {
  createDeduplicationStatements,
  findExistingPlace,
  checkIngestionRun,
  startIngestionRun,
  completeIngestionRun,
  failIngestionRun,
  addCapitalRelationship,
  getCapitalCountries,
  generateCapitalExternalId,
  mergeDuplicatePlaces,
  mergeDuplicateCapitals,
  countPlacesForDuplicateCorrection,
  countCapitalCitiesForDuplicateCorrection
};
