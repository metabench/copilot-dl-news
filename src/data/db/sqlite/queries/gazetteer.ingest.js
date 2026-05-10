'use strict';

const {
  createClassicGazetteerIngestionStatements,
  upsertClassicGazetteerPlace,
  insertClassicGazetteerPlaceName,
  insertClassicGazetteerExternalId,
  setClassicGazetteerCanonicalName,
  normalizeClassicGazetteerName,
  findExistingClassicGazetteerPlace,
  generateClassicGazetteerCapitalExternalId
} = require('news-crawler-db');

module.exports = {
  createIngestionStatements: createClassicGazetteerIngestionStatements,
  upsertPlace: upsertClassicGazetteerPlace,
  insertPlaceName: insertClassicGazetteerPlaceName,
  insertExternalId: insertClassicGazetteerExternalId,
  setCanonicalName: setClassicGazetteerCanonicalName,
  normalizeName: normalizeClassicGazetteerName,
  findExistingPlace: findExistingClassicGazetteerPlace,
  generateCapitalExternalId: generateClassicGazetteerCapitalExternalId
};
